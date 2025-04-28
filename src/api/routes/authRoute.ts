import { Request, Response } from 'express';
import { JSONResponse, RouteStructure } from '../../structures';
import { Logger } from '../../utils/logger';
import { Util } from '../../utils/util';
import { Info } from '../../utils/info';

class AuthRoute extends RouteStructure {
    run = async (req: Request, res: Response) => {
        try {
            const clientInfo = await Info.getClientInfo(req);
            const clientFingerprint = this.generateFingerprint(clientInfo);
            const existingSession = this.findExistingSession(clientFingerprint);

            let sessionId: string;

            if (existingSession) {
                existingSession.lastAccess = new Date();
                sessionId = existingSession.sessionId;

                Logger.info(`Sessão reutilizada para ${clientInfo.ip}`, AuthRoute.name);
            } else {
                sessionId = Util.generateSessionId();
                this.client.connection?.sessions.set(sessionId, {
                    sessionId,
                    clientInfo,
                    lastAccess: new Date(),
                    fingerprint: clientFingerprint
                });

                this.cleanupOldSessions();
                Logger.info(`Nova sessão criada para ${clientInfo.ip}`, AuthRoute.name);
            }

            this.setSessionCookie(res, sessionId);
            this.logClientInfo(clientInfo);

            res.status(200).json(new JSONResponse(200, 'OK', {
                session: sessionId,
                clientInfo: this.sanitizeClientInfo(clientInfo)
            }).toJSON());
        } catch (err) {
            Logger.error((err as Error).message, AuthRoute.name);
            Logger.warn((err as Error).stack, AuthRoute.name);

            res.status(500).json(new JSONResponse(500, 'Internal Server Error').toJSON());
        }
    };

    private generateFingerprint(clientInfo: any): string {
        const factors = [
            clientInfo.ip,
            clientInfo.userAgent,
            clientInfo.browser || '',
            clientInfo.os || '',
            clientInfo.platform || '',
            clientInfo.language || '',
            clientInfo.geolocation?.countryCode || '',
            clientInfo.geolocation?.city || ''
        ];

        return Util.hashString(factors.join('|'));
    }

    private findExistingSession(fingerprint: string) {
        for (const [_, session] of (this.client.connection?.sessions?.entries() || [])) {
            if (session.fingerprint === fingerprint) {
                return session;
            }
        }
        return null;
    }

    private cleanupOldSessions() {
        const now = new Date();
        const SESSION_TIMEOUT = 30 * 60 * 1000;

        for (const [sessionId, session] of this.client.connection?.sessions.entries() || []) {
            if (now.getTime() - session.lastAccess.getTime() > SESSION_TIMEOUT) {
                this.client.connection?.sessions.delete(sessionId);
                Logger.info(`Sessão expirada removida: ${sessionId}`, AuthRoute.name);
            }
        }
    }

    private setSessionCookie(res: Response, sessionId: string) {
        res.cookie('session_id', sessionId, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 7 * 24 * 60 * 60 * 1000,
            path: '/',
            domain: process.env.COOKIE_DOMAIN || undefined
        });
    }

    private logClientInfo(clientInfo: any) {
        const infoMessages = Info.getClientInfoMessage(clientInfo);
        Logger.info('Detalhes da conexão do cliente:\n' + infoMessages.join('\n'), AuthRoute.name);
    }

    private sanitizeClientInfo(clientInfo: any): any {
        const { cookies, ...safeInfo } = clientInfo;
        if (safeInfo.geolocation) {
            const { query, ...safeGeo } = safeInfo.geolocation;
            safeInfo.geolocation = safeGeo;
        }
        return safeInfo;
    }
}

export {
    AuthRoute
};