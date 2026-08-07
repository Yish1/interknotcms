import { 
    Injectable,
    OnModuleInit,
    OnModuleDestroy,
} from '@nestjs/common';
import { PrismaClient } from '../generated/prisma/client.js';
import { PrismaPg } from '@prisma/adapter-pg';

@Injectable()
export class PrismaService 
    extends PrismaClient
    implements OnModuleInit, OnModuleDestroy  
{
    constructor() {
        const connectionString = process.env.DATABASE_URL;
        if (!connectionString) {
            throw new Error('DATABASE_URL environment variable is not set.');
        }
        const adapter = new PrismaPg({
            connectionString,
        })

        super({
            adapter,
        })
    }

    async onModuleInit(): Promise<void> {
        try {
            await this.$connect();
            console.log('✅ Database connected');
        } catch (error) {
            console.error('❌ Failed to connect to database:', error);
            throw error;
        }
    }

    async onModuleDestroy() : Promise<void> {
        await this.$disconnect();
    }
}
