/*---------------------------------------------------------------------------------------------
* Copyright (c) 2020 Simon Waelti
* Licensed under the MIT License. See License.txt in the project root for license information.
*--------------------------------------------------------------------------------------------*/

'use strict';
import {
    LoggingDebugSession,
    InitializedEvent,
    TerminatedEvent,
    StoppedEvent,
    ContinuedEvent,
    InvalidatedEvent,
    OutputEvent,
    ThreadEvent,
    Thread,
    StackFrame,
    Source,
    Scope,
} from '@vscode/debugadapter';

import {
    ConnectReply,
    ControlServiceClient,
    MachineEvent,
    MachineState,
    StatusReply,
    StateType,
    InitRequest
} from './debugService';

import { createClient } from './grpcClient';
import { DebugProtocol } from '@vscode/debugprotocol';
import { LanguageClient } from 'vscode-languageclient/node';
import * as vscode from 'vscode';
import { log } from 'console';
import { ClientReadableStream, ServiceError, status } from '@grpc/grpc-js';

const path = require('path'); // CommonJS-Import

interface ProgramDebugInfo {
    program: string,
    sequence: number,
    line: number,
    uri: string
}

interface VariableInfo {
    id: string,
    address: string,
	size?: number,
}

interface LinkedFileInfo {
    path: number;
    files: string[];
};

interface AllVariableInfoParams {
    linkedFiles: string[];
}

interface LinkedFileInfoParams {
    workspaceFolderUri: string;
}

interface ProgramVariableInfoParams {
    programNumber: number;
    documentUri: string;
}

interface ProgramSequenceInfoParams {
    programNumber: number;
    sequenceNumber: number;
    linkedFiles: string[];
}

type PathState = {
    state?: StateType;
    programNumber?: number;
    sequenceNumber?: number;
    program?: string;
    uri?: string;
    line?: number;
    variableDefs?: VariableInfo[];
};

enum ErrorCodes {
    NotImplemented = 1000,
    NoWorkspaceOpen = 1001,
    InvalidGrpcServer = 1002,
    ConnectionFailed = 1003,
    CycleStartFailed = 1004,
    CycleStopFailed = 1005,
    SingleBlockFailed = 1006,
    VariablesFailed = 1007
}

enum VariableType {
    Cnc   = 0x00010000,
    Pmc     = 0x00100000
}

enum ScopeMask {
    Path   = 0x0000FFFF,
    Kind   = 0xFFFF0000
}

export default class MacroDebugSession extends LoggingDebugSession {

    private grpcClient: ControlServiceClient;
    private paths: Map<number, PathState> = new Map();
    private linkedFiles: Map<number, string[]> = new Map();
    private cncEventQueue: MachineEvent[] = [];
    private processingQueue = false;
    private eventStream: ClientReadableStream<MachineEvent>;

    constructor(private languageClient:LanguageClient) {
        const logFile = path.resolve(__dirname, 'dap.log'); 
        super(logFile, true);

        this.setDebuggerLinesStartAt1(true);
        this.setDebuggerColumnsStartAt1(true);
    }

    protected initializeRequest(response: DebugProtocol.InitializeResponse, args: DebugProtocol.InitializeRequestArguments) {
        response.body = {
            supportsConfigurationDoneRequest: true,
            supportsRestartRequest: false,
            supportsStepInTargetsRequest: false,
            supportsStepBack: false,
            supportsSteppingGranularity: false,
            supportsEvaluateForHovers: true,
            supportsExceptionInfoRequest: true 
        };

        this.sendResponse(response);
    }

    private async sendLinkedFileInfoRequest(params: LinkedFileInfoParams) : Promise<LinkedFileInfo[]> {

        return await this.languageClient.sendRequest<LinkedFileInfo[]>(
            "macro/linkedFileInfoRequest",
            params
        );
    }

    private async sendAllVariableInfoRequest(params: AllVariableInfoParams) : Promise<VariableInfo[]> {

        return await this.languageClient.sendRequest<VariableInfo[]>(
            "macro/allVariableInfoRequest",
            params
        );
    }

    private async sendProgramVariableInfoRequest(params: ProgramVariableInfoParams) : Promise<VariableInfo[]> {

        return await this.languageClient.sendRequest<VariableInfo[]>(
            "macro/programVariableInfoRequest",
            params
        );
    }

    private async sendProgramSequenceInfoRequest(params: ProgramSequenceInfoParams) : Promise<ProgramDebugInfo> {

        return await this.languageClient.sendRequest<ProgramDebugInfo>(
            "macro/programSequenceInfoRequest",
            params
        );
    }

    protected async launchRequest(response: DebugProtocol.LaunchResponse, args: any) {
        console.log("Connecting to CNC at:", args.grpcServer);

       let workspaceFolderUri = args.workspace;
        if (!workspaceFolderUri) {
            const folders = vscode.workspace.workspaceFolders;
            if (!folders || folders.length === 0) {
                this.sendErrorResponse(response, ErrorCodes.NoWorkspaceOpen, "No workspace folder is open.");
                return;
            }
            workspaceFolderUri = folders[0].uri.toString();
        }

        const fileInfo = await this.sendLinkedFileInfoRequest({ workspaceFolderUri: workspaceFolderUri });
        const variableInfos = await this.sendAllVariableInfoRequest({linkedFiles: fileInfo.flatMap(a => a.files)});
        
        this.linkedFiles = new Map(fileInfo.map(item => [item.path, item.files]));

        this.grpcClient = createClient(args.grpcServer);

        const initRequest: InitRequest = {
            "cncNodeId": args.cncNodeId,
            "cncNodeIpAddress": args.cncNodeIpAddress,
            "cncPaths": args.cncPaths,
            "pollingRate": args.pollingRate,
            "variables": variableInfos
        }

        this.grpcClient.connect(initRequest, (err: ServiceError, res: ConnectReply) => {
            if (err) {
                this.sendErrorResponse(response, ErrorCodes.ConnectionFailed, "Failed to connect to CNC");
                return;
            }
         
            this.eventStream = this.grpcClient.subscribeEvents({});
            this.eventStream.on("data", (event: MachineEvent) => {
                this.handleMachineEvent(event);
            });

            this.eventStream.on("error", (err: any) => {
                if (err.code === status.CANCELLED) {
                    return;
                }

                console.error("gRPC stream error:", err);
                this.sendEvent(new TerminatedEvent());
            });

            this.eventStream.on("end", () => {
                console.log("gRPC stream closed");
            });

            this.sendEvent(new InitializedEvent());
            this.sendResponse(response);
        });
    }

    protected configurationDoneRequest(response: DebugProtocol.ConfigurationDoneResponse, args: DebugProtocol.ConfigurationDoneArguments, request?: DebugProtocol.Request) {
        this.grpcClient.connectControl({}, (err: ServiceError, res: ConnectReply) => {
            if (res.state.success === true) {
                console.log("Connected to CNC:", res);
                this.sendResponse(response);
            }
            else {
                this.sendErrorResponse(response, ErrorCodes.ConnectionFailed, res.state.message);
            }
        });
    }

    protected disconnectRequest(response: DebugProtocol.DisconnectResponse, args: DebugProtocol.DisconnectArguments) {
        console.log("Disconnecting");

        this.grpcClient?.disconnect({}, (err: ServiceError, res: StatusReply) => {

            if (this.eventStream) {
                this.eventStream.cancel();
                this.eventStream = null;
            }

            this.paths.clear();
            this.linkedFiles.clear();
            this.cncEventQueue = [];
            this.processingQueue = false;

            this.sendResponse(response);
            this.sendEvent(new TerminatedEvent());

            if (err) {
                console.error(err);
            }
        });
    }

    protected continueRequest(response: DebugProtocol.ContinueResponse, args: DebugProtocol.ContinueArguments) {
        this.grpcClient.cycleStart({}, (err: ServiceError, res: StatusReply) => {
            if (err || !res.success) {
                this.sendErrorResponse(response, ErrorCodes.CycleStartFailed, "CycleStart failed");
                return;
            }
            console.log(res);
            this.sendResponse(response);
        });
    }

    protected pauseRequest(response: DebugProtocol.PauseResponse, args: DebugProtocol.PauseArguments, request?: DebugProtocol.Request) {
        this.grpcClient.cycleStop({}, (err: ServiceError, res: StatusReply) => {
            if (err || !res.success) {
                this.sendErrorResponse(response, ErrorCodes.CycleStopFailed, "SingleBlock failed");
                return;
            }
            console.log(res);
            this.sendResponse(response);
        });
    }

    protected nextRequest(response: DebugProtocol.NextResponse, args: DebugProtocol.NextArguments) {
        this.grpcClient.singleBlock({}, (err: ServiceError, res: StatusReply) => {
            if (err || !res.success) {
                this.sendErrorResponse(response, ErrorCodes.SingleBlockFailed, "SingleBlock failed");
                return;
            }
            console.log(res);
            this.sendResponse(response);
        });
    }

    protected stepInRequest(response: DebugProtocol.StepInResponse, args: DebugProtocol.StepInArguments, request?: DebugProtocol.Request) {
        this.sendErrorResponse(response, ErrorCodes.NotImplemented, "Not implemented");
    }

    protected stepOutRequest(response: DebugProtocol.StepOutResponse, args: DebugProtocol.StepOutArguments, request?: DebugProtocol.Request) {
        this.sendErrorResponse(response, ErrorCodes.NotImplemented, "Not implemented");
    }

    protected stepBackRequest(response: DebugProtocol.StepBackResponse, args: DebugProtocol.StepBackArguments, request?: DebugProtocol.Request) {
        this.sendErrorResponse(response, ErrorCodes.NotImplemented, "Not implemented");
    }

    protected async stackTraceRequest(response: DebugProtocol.StackTraceResponse, args: DebugProtocol.StackTraceArguments) {

        const pathState = this.paths.get(args.threadId)
        const files = this.linkedFiles.get(args.threadId);
        const result = await this.sendProgramSequenceInfoRequest({
            programNumber: pathState.programNumber,
            sequenceNumber: pathState.sequenceNumber,
            linkedFiles: files
        })

        let frame: StackFrame = null;

        if (result) {
            pathState.uri = result.uri;
            frame = new StackFrame(
                1,
                `${result.program}  (N${result.sequence})`,
                new Source(result.program, result.uri),
                result.line + 1,
                0);

            response.body = {
                stackFrames: [frame],
                totalFrames: 1
            };
        }

        this.sendResponse(response);
    }

    protected exceptionInfoRequest(response: DebugProtocol.ExceptionInfoResponse, args: DebugProtocol.ExceptionInfoArguments) {
        this.grpcClient.getState({ pathNumber: args.threadId }, (err: ServiceError, res: MachineState) => {
  
            response.body = {
                exceptionId: res.messageType,
                description: res.message,
                breakMode: 'always',
            };

            this.sendResponse(response);
        });
	}

    protected scopesRequest(response: DebugProtocol.ScopesResponse, args: DebugProtocol.ScopesArguments) {

        const scopes:Scope[] = [];
        const states = Array.from(this.paths.entries()).sort((a, b) => a[0] - b[0]);
        for (const [key, value] of states) {
            scopes.push({
                    name: `Path ${key}`,
                    variablesReference: key,
                    expensive: false
                });
        }

        response.body = { scopes: scopes };
        this.sendResponse(response);
    }

    protected async variablesRequest(response: DebugProtocol.VariablesResponse, args: DebugProtocol.VariablesArguments, request?: DebugProtocol.Request) {

        const ref = args.variablesReference;
        const kind = ref & ScopeMask.Kind;
        const path = ref & ScopeMask.Path;
        const pathState = this.paths.get(path);

        if (kind === 0) {

            pathState.variableDefs = await this.sendProgramVariableInfoRequest({programNumber: pathState.programNumber, documentUri: pathState.uri});
            response.body = {
                variables: [
                    { name: "CNC", value: "", variablesReference: VariableType.Cnc | ref },
                    { name: "PMC", value: "", variablesReference: VariableType.Pmc | ref  }
                ]
            }

            this.sendResponse(response);
            return
        }
    
        if (pathState.variableDefs === null) {
                return this.sendResponse(response);
        }

        const requestedVar = pathState.variableDefs
            .filter(v => v.address.startsWith('#') === (kind === VariableType.Cnc))
            .map(v => ({
                id: v.id,
                address: v.address,
                size: v.size,
            }));

        this.grpcClient.getVariables({path: path, variables: requestedVar}, (err: any, res: any) => {
            if (err) {
                this.sendErrorResponse(response, ErrorCodes.VariablesFailed, "Variable request failed");
                return;
            }
            
            console.log(res);
            
            if (res) {
                const resArray = Array.isArray(res.variables) ? res.variables : [];
                response.body = {
                    variables: resArray.map((v, i) => ({
                        name: v.id,
                        value: v.value,
                        variablesReference: 0
                    }))
                };
            }

            this.sendResponse(response);
        });
    }

    protected threadsRequest(response: DebugProtocol.ThreadsResponse) {

        const threads = Array.from(this.paths.keys()).map(pathNumber =>
            new Thread(pathNumber, `Path ${pathNumber}`)
        );

        response.body = { threads };
        this.sendResponse(response);
    }


    // Grpc server events
    private handleMachineEvent(event: MachineEvent) {
        this.cncEventQueue.push(event);
        this.processQueue();   
    }

     private processQueue() {

        if (this.processingQueue) {
            return;
        }

        this.processingQueue = true;
        console.log(`${this.cncEventQueue.length}`);
      
        try {
            while (this.cncEventQueue.length > 0) 
            {
                const pathState = this.cncEventQueue.shift()!;
                const pathId = pathState.pathNumber;

                // Send log to VSCode Debug Console
                const typeString = StateType[pathState.state];
            
                console.log(`${typeString} on Path ${pathState.pathNumber} O${pathState.programNumber} N${pathState.sequenceNumber}\n`, 'console');

                if (pathState.state === StateType.DISCONNECT) {
                    this.sendEvent(new TerminatedEvent());
                    this.cncEventQueue.length = 0;
                    continue;
                }

                let entry = this.paths.get(pathId);
                if (!entry) {
                    entry = {state: undefined, programNumber: 0, sequenceNumber: 0 }
                    this.paths.set(pathId, entry);
                    this.sendEvent(new ThreadEvent("started", pathId));
                }

                if (entry.state !== pathState.state) 
                {
                    entry.state = pathState.state;
                    entry.programNumber = pathState.programNumber;
                    entry.sequenceNumber = pathState.sequenceNumber;
              
                    switch (pathState.state) {
                        case StateType.CYCLE_RESET:
                            if (this.paths.has(pathState.pathNumber)) { 
                                this.sendEvent(new ThreadEvent("exited", pathState.pathNumber));
                                this.paths.delete(pathState.pathNumber);
                            }
                            break;

                        case StateType.ALARM:
                            this.sendEvent(new StoppedEvent("exception", pathState.pathNumber, pathState.message));
                            break;

                        case StateType.CYCLE_STOPPED:
                            this.sendEvent(new StoppedEvent("step", pathState.pathNumber));
                            break;

                        case StateType.CYCLE_HOLD: 
                            this.sendEvent(new StoppedEvent("step", pathState.pathNumber));
                            break;

                        case StateType.CYCLE_STARTED:
                            this.sendEvent(new ContinuedEvent(pathState.pathNumber, false));
                            break;
                    }
                }
            }
        }
        catch(error) {
            console.log(error);
        }
        finally {
            this.processingQueue = false;
        }
    }
}
