import { Request } from 'express';
import { IncomingMessage } from 'http';
import useragent from 'useragent';
import WebSocket from 'ws';
import axios from 'axios';
import NodeCache from 'node-cache';

interface GeolocationData {
    status: 'success' | 'fail';
    country?: string;
    countryCode?: string;
    region?: string;
    regionName?: string;
    city?: string;
    zip?: string;
    lat?: number;
    lon?: number;
    timezone?: string;
    isp?: string;
    org?: string;
    as?: string;
    query?: string;
}

interface ConnectionInfo {
    ip: string;
    userAgent: string;
    referer?: string;
    host?: string;
    connection?: string;
    cookies: Record<string, string>;
    geolocation?: GeolocationData | null;
}

interface HttpRequestInfo extends ConnectionInfo {
    route: string;
    browser: string;
    version: string;
    os: string;
    platform: string;
    language?: string;
}

interface WebSocketInfo extends ConnectionInfo {
    protocol?: string;
    origin?: string;
}

const geoCache = new NodeCache({ stdTTL: 3600, checkperiod: 600 });

export class Info {
    private static readonly IP_API_URL = 'http://ip-api.com/json/';
    private static readonly IP_API_FIELDS = [
        'status', 'country', 'countryCode', 'region', 'regionName', 
        'city', 'zip', 'lat', 'lon', 'timezone', 'isp', 'org', 'as', 'query'
    ].join(',');

    public static getClientIp(req: Request | IncomingMessage): string {
        try {
            const ipSources = [
                req.headers['x-real-ip'],
                req.headers['x-forwarded-for'],
                (req as Request).ip,
                (req as any).connection?.remoteAddress,
                (req as any).socket?.remoteAddress
            ];
    
            const candidateIps: string[] = [];
            for (const ip of ipSources) {
                if (!ip) continue;
                
                const ipStr = Array.isArray(ip)
                    ? ip[0].split(',')[0].trim()
                    : String(ip).split(',')[0].trim();
    
                if (ipStr === '::1' || ipStr === '0:0:0:0:0:0:0:1') {
                    candidateIps.push('127.0.0.1');
                } else {
                    candidateIps.push(ipStr);
                }
            }
    
            for (const candidate of candidateIps) {
                if (/^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/.test(candidate)) {
                    return candidate;
                }
            }
            
            for (const candidate of candidateIps) {
                if (this.isValidIp(candidate)) {
                    return candidate;
                }
            }
    
            return 'unknown';
        } catch (error) {
            console.error('Error getting client IP:', error);
            return 'unknown';
        }
    }

    private static isValidIp(ip: string): boolean {
        if (!ip) return false;
        return /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/.test(ip) || 
               /^([a-f0-9:]+:+)+[a-f0-9]+$/.test(ip);
    }

    private static async getGeolocation(ip: string): Promise<GeolocationData | null> {
        if (!this.isValidIp(ip) || ip === 'unknown') return null;

        try {
            const cached = geoCache.get<GeolocationData>(ip);
            if (cached) return cached;

            const response = await axios.get<GeolocationData>(`${this.IP_API_URL}${ip}?fields=${this.IP_API_FIELDS}`);

            if (response.data.status === 'success') {
                geoCache.set(ip, response.data);
                return response.data;
            }

            return null;
        } catch (error) {
            console.error('Error fetching geolocation:', error);
            return null;
        }
    }

    private static async extractHttpRequestInfo(req: Request): Promise<HttpRequestInfo> {
        try {
            const ip = this.getClientIp(req);
            const userAgentString = req.headers['user-agent'] || '';
            const agent = useragent.parse(userAgentString);
            const geolocation = await this.getGeolocation(ip);

            return {
                ip,
                route: req.originalUrl || req.url || '',
                browser: agent.family,
                version: agent.toVersion(),
                os: agent.os.family,
                platform: agent.device.family,
                language: req.headers['accept-language']?.toString().split(',')[0],
                userAgent: userAgentString,
                referer: req.headers.referer?.toString(),
                host: req.headers.host,
                connection: req.headers.connection,
                cookies: this.parseCookies(req.headers.cookie || ''),
                geolocation
            };
        } catch (error) {
            console.error('Error extracting HTTP request info:', error);
            throw new Error('Failed to extract HTTP request information');
        }
    }

    private static async extractWebSocketInfo(ws: WebSocket, req: IncomingMessage): Promise<WebSocketInfo> {
        try {
            const ip = this.getClientIp(req);
            const geolocation = await this.getGeolocation(ip);

            return {
                ip,
                userAgent: req.headers['user-agent'] || '',
                referer: req.headers.referer?.toString(),
                host: req.headers.host,
                connection: req.headers.connection,
                cookies: this.parseCookies(req.headers.cookie || ''),
                protocol: ws.protocol,
                origin: req.headers.origin,
                geolocation
            };
        } catch (error) {
            console.error('Error extracting WebSocket info:', error);
            throw new Error('Failed to extract WebSocket information');
        }
    }

    private static parseCookies(cookieHeader: string): Record<string, string> {
        return cookieHeader.split(';').reduce<Record<string, string>>((cookies, cookie) => {
            const [name, value] = cookie.split('=').map(c => c.trim());
            if (name) cookies[name] = value || '';
            return cookies;
        }, {});
    }

    public static getClientInfoMessage(info: ConnectionInfo): string[] {
        const message: string[] = [];

        message.push(`IP Address: ${info.ip}`);
        if ('route' in info) message.push(`Route: ${(info as HttpRequestInfo).route}`);
        
        if (info.geolocation) {
            const geo = info.geolocation;
            if (geo.city) message.push(`Location: ${geo.city}, ${geo.regionName}, ${geo.country}`);
            if (geo.isp) message.push(`ISP: ${geo.isp}`);
            if (geo.timezone) message.push(`Timezone: ${geo.timezone}`);
        }

        if ('browser' in info) {
            const httpInfo = info as HttpRequestInfo;
            message.push(`Browser: ${httpInfo.browser} ${httpInfo.version}`);
            message.push(`OS: ${httpInfo.os}`);
            message.push(`Platform: ${httpInfo.platform}`);
            if (httpInfo.language) message.push(`Language: ${httpInfo.language}`);
        }

        if (info.userAgent) message.push(`User Agent: ${info.userAgent}`);
        if (info.referer) message.push(`Referer: ${info.referer}`);
        if (info.host) message.push(`Host: ${info.host}`);
        if (info.connection) message.push(`Connection: ${info.connection}`);
        if (Object.keys(info.cookies).length > 0) {
            message.push(`Cookies: ${JSON.stringify(info.cookies)}`);
        }
        if ('protocol' in info) message.push(`Protocol: ${(info as WebSocketInfo).protocol}`);
        if ('origin' in info) message.push(`Origin: ${(info as WebSocketInfo).origin}`);

        return message;
    }

    public static async getClientInfo(req: Request | IncomingMessage, ws?: WebSocket): Promise<ConnectionInfo> {
        if (ws) {
            return this.extractWebSocketInfo(ws, req as IncomingMessage);
        } else {
            return this.extractHttpRequestInfo(req as Request);
        }
    }
}