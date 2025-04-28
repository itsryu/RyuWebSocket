import { MemberPresence } from "../@types";

export class AsyncPresenceMap {
    private static instance: AsyncPresenceMap;
    private data: Map<string, MemberPresence> = new Map();
    private waitingResolvers: Map<string, Array<(value: MemberPresence) => void>> = new Map();

    private constructor() {}

    public static getInstance(): AsyncPresenceMap {
        if (!AsyncPresenceMap.instance) {
            AsyncPresenceMap.instance = new AsyncPresenceMap();
        }
        return AsyncPresenceMap.instance;
    }

    public async get(userId: string): Promise<MemberPresence | undefined> {
        if (this.data.has(userId)) {
            return this.data.get(userId);
        }
        
        return new Promise<MemberPresence>((resolve) => {
            if (!this.waitingResolvers.has(userId)) {
                this.waitingResolvers.set(userId, []);
            }
            this.waitingResolvers.get(userId)?.push(resolve);
        });
    }

    public set(userId: string, presence: MemberPresence): void {
        this.data.set(userId, presence);
        
        if (this.waitingResolvers.has(userId)) {
            const resolvers = this.waitingResolvers.get(userId)!;
            for (const resolve of resolvers) {
                resolve(presence);
            }
            this.waitingResolvers.delete(userId);
        }
    }

    public has(userId: string): boolean {
        return this.data.has(userId);
    }

    public delete(userId: string): void {
        this.data.delete(userId);
        this.waitingResolvers.delete(userId);
    }
}