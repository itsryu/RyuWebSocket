import { NextFunction, Request, Response } from 'express';
import { EmbedBuilder, RouteStructure } from '../../structures';
import { Logger } from '../../utils/logger';
import { Util } from '../../utils/util';
import { Info } from '../../utils/info';

class InfoMiddleware extends RouteStructure {
    run = async (req: Request, _: Response, next: NextFunction) => {
        try {
            const info = Info.getClientInfo(req);
            const message = Info.getClientInfoMessage(info);

            const embed = new EmbedBuilder()
                .setColor(0x1ed760)
                .setTitle('Info Middleware')
                .setDescription(message.join('\n'))
                .setTimestamp(new Date().toISOString());

            Logger.info(message.join('\n'), InfoMiddleware.name);
            await Util.webhookLog({ embeds: [embed] });

            next();
        } catch (err) {
            Logger.error((err as Error).message, InfoMiddleware.name);
            Logger.warn((err as Error).stack, InfoMiddleware.name);

            next(err);
        }
    };
}

export {
    InfoMiddleware
};