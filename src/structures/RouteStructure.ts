
import { NextFunction, Request, Response } from 'express';
import { Server } from '../api/server';
import { HTTPStatus } from '../types/HTTPSInterfaces';

interface JSONObjectResponse<T = any> {
    code: HTTPStatus;
    message: string;
    data?: T;
}

class JSONResponse<T = any> {
    constructor(
        private readonly code: HTTPStatus,
        private readonly message: string,
        private readonly data?: T
    ) {}

    toJSON(): JSONObjectResponse<T> {
        return {
            code: this.code,
            message: this.message,
            ...(this.data !== undefined ? { data: this.data } : {})
        };
    }

    static fromObject<U>(obj: JSONObjectResponse<U>): JSONResponse<U> {
        return new JSONResponse<U>(obj.code, obj.message, obj.data);
    }

    getStatusCode(): HTTPStatus {
        return this.code;
    }

    getMessage(): string {
        return this.message;
    }

    getData(): T | undefined {
        return this.data;
    }
}

abstract class RouteStructure<T = Request, K = Response, N = NextFunction, V = void> {
    public readonly client: Server;

    public constructor(client: Server) {
        this.client = client;
    }

    public abstract run(req: T, res: K, next: N): Promise<V> | V;
}

export { RouteStructure, JSONResponse };