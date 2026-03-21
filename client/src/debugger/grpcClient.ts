/*---------------------------------------------------------------------------------------------
* Copyright (c) 2020 Simon Waelti
* Licensed under the MIT License. See License.txt in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import * as grpc from "@grpc/grpc-js";
import { ControlServiceClient } from "./debugService";

export function createClient(address: string): ControlServiceClient {
    const client = new ControlServiceClient(
        address,
        grpc.credentials.createInsecure()
    );

    return client;
}