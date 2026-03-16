import * as grpc from "@grpc/grpc-js";
import { ControlServiceClient } from "./debugService";

export function createClient(address: string): ControlServiceClient {
    const client = new ControlServiceClient(
        address,
        grpc.credentials.createInsecure()
    );

    return client;
}