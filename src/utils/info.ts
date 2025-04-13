import { Request } from 'express';
import { IncomingMessage } from 'http';
import useragent from 'useragent';
import WebSocket from 'ws';

interface ConnectionInfo {
    ipAddress: string | string[] | undefined;
    userAgent: string;
    referer: string | string[] | undefined;
    host: string | undefined;
    connection: string | undefined;
    cookies: Record<string, string>;
}

interface HttpRequestInfo extends ConnectionInfo {
    route: string;
    browser: string;
    version: string;
    os: string;
    platform: string;
    language: string | string[] | undefined;
}

interface WebSocketInfo extends ConnectionInfo {
    protocol: string | undefined;
    origin: string | undefined;
}

export class Info {
    private static extractHttpRequestInfo(req: Request): HttpRequestInfo {
        try {
            const userAgentString = req.headers['user-agent'] ?? '';
            const referer = req.headers.referer ?? req.headers.referrer;
            const host = req.headers.host;
            const connection = req.headers.connection;
            const cookies = this.parseCookies(req.headers.cookie ?? '');
            const agent = useragent.parse(userAgentString);
            const ip = req.ip ?? req.headers['x-forwarded-for'] ?? req.connection.remoteAddress ?? req.socket.remoteAddress;

            return {
                route: req.url ?? req.originalUrl,
                ipAddress: ip,
                browser: agent.family,
                version: agent.toVersion(),
                os: agent.os.family,
                platform: agent.device.family,
                language: req.headers['accept-language'],
                userAgent: userAgentString,
                referer: referer,
                host: host,
                connection: connection,
                cookies: cookies
            };
        } catch (error) {
            console.error('Error extracting HTTP request info:', error);
            throw new Error('Failed to extract HTTP request information');
        }
    }

    private static extractWebSocketInfo(ws: WebSocket, req: IncomingMessage): WebSocketInfo {
        try {
            const userAgentString = req.headers['user-agent'] ?? '';
            const referer = req.headers.referer ?? req.headers.referrer;
            const host = req.headers.host;
            const connection = req.headers.connection;
            const cookies = this.parseCookies(req.headers.cookie ?? '');
            const ip = req.headers['x-forwarded-for'] ?? req.connection.remoteAddress ?? req.socket.remoteAddress;

            return {
                ipAddress: ip,
                userAgent: userAgentString,
                referer: referer,
                host: host,
                connection: connection,
                cookies: cookies,
                protocol: ws.protocol,
                origin: req.headers.origin
            };
        } catch (error) {
            console.error('Error extracting WebSocket info:', error);
            throw new Error('Failed to extract WebSocket information');
        }
    }

    private static parseCookies(cookieHeader: string): Record<string, string> {
        return cookieHeader.split(';').reduce<Record<string, string>>((cookies, cookie) => {
            const [name, value] = cookie.split('=').map(c => c.trim());
            cookies[name] = value;
            return cookies;
        }, {});
    }

    public static getClientInfoMessage(info: ConnectionInfo): string[] {
        const message: string[] = [];

        if ('route' in info) message.push(`Route: ${(info as HttpRequestInfo).route}`);
        if (info.ipAddress) message.push(`IP Address: ${info.ipAddress}`);
        if ('browser' in info) message.push(`Browser: ${(info as HttpRequestInfo).browser}`);
        if ('version' in info) message.push(`Version: ${(info as HttpRequestInfo).version}`);
        if ('os' in info) message.push(`OS: ${(info as HttpRequestInfo).os}`);
        if ('platform' in info) message.push(`Platform: ${(info as HttpRequestInfo).platform}`);
        if ('language' in info) message.push(`Language: ${(info as HttpRequestInfo).language}`);
        if (info.userAgent) message.push(`User Agent: ${info.userAgent}`);
        if (info.referer) message.push(`Referer: ${info.referer}`);
        if (info.host) message.push(`Host: ${info.host}`);
        if (info.connection) message.push(`Connection: ${info.connection}`);
        if (Object.keys(info.cookies).length > 0) message.push(`Cookies: ${JSON.stringify(info.cookies)}`);
        if ('protocol' in info) message.push(`Protocol: ${(info as WebSocketInfo).protocol}`);
        if ('origin' in info) message.push(`Origin: ${(info as WebSocketInfo).origin}`);

        return message;
    }

    public static getClientInfo(req: Request | IncomingMessage, ws?: WebSocket): ConnectionInfo {
        if (ws) {
            return this.extractWebSocketInfo(ws, req as IncomingMessage);
        } else {
            return this.extractHttpRequestInfo(req as Request);
        }
    }
}