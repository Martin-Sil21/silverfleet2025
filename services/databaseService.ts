// Mock Database Service for tracking database operations during audits
import type { DatabaseOperationSummary } from '../types';

interface DatabaseOperation {
    type: 'READ' | 'WRITE' | 'UPDATE' | 'DELETE';
    table: string;
    timestamp: number;
    data?: any;
    query?: string;
}

class MockDatabase {
    private data: Record<string, any[]> = {};
    private operations: DatabaseOperation[] = [];
    private conversationId: string = '';

    constructor(initialSchema?: Record<string, any[]>) {
        if (initialSchema) {
            this.data = JSON.parse(JSON.stringify(initialSchema)); // Deep copy
        }
    }

    setConversationId(id: string) {
        this.conversationId = id;
    }

    // READ operations
    query(table: string, filter?: (item: any) => boolean): any[] {
        this.operations.push({
            type: 'READ',
            table,
            timestamp: Date.now(),
            query: filter?.toString()
        });

        if (!this.data[table]) {
            console.warn(`⚠️ [DB Mock] Table "${table}" does not exist.`);
            return [];
        }

        if (filter) {
            return this.data[table].filter(filter);
        }

        return [...this.data[table]];
    }

    // WRITE operations (INSERT)
    insert(table: string, record: any): boolean {
        this.operations.push({
            type: 'WRITE',
            table,
            timestamp: Date.now(),
            data: record
        });

        if (!this.data[table]) {
            this.data[table] = [];
        }

        this.data[table].push(record);
        console.log(`✅ [DB Mock] Inserted record into "${table}":`, record);
        return true;
    }

    // UPDATE operations
    update(table: string, filter: (item: any) => boolean, updates: Partial<any>): number {
        this.operations.push({
            type: 'UPDATE',
            table,
            timestamp: Date.now(),
            data: updates,
            query: filter.toString()
        });

        if (!this.data[table]) {
            console.warn(`⚠️ [DB Mock] Table "${table}" does not exist.`);
            return 0;
        }

        let count = 0;
        this.data[table] = this.data[table].map(item => {
            if (filter(item)) {
                count++;
                return { ...item, ...updates };
            }
            return item;
        });

        console.log(`✅ [DB Mock] Updated ${count} records in "${table}"`);
        return count;
    }

    // DELETE operations
    delete(table: string, filter: (item: any) => boolean): number {
        this.operations.push({
            type: 'DELETE',
            table,
            timestamp: Date.now(),
            query: filter.toString()
        });

        if (!this.data[table]) {
            console.warn(`⚠️ [DB Mock] Table "${table}" does not exist.`);
            return 0;
        }

        const before = this.data[table].length;
        this.data[table] = this.data[table].filter(item => !filter(item));
        const deleted = before - this.data[table].length;

        console.log(`✅ [DB Mock] Deleted ${deleted} records from "${table}"`);
        return deleted;
    }

    // Get summary of operations
    getSummary(): DatabaseOperationSummary {
        const reads = this.operations.filter(op => op.type === 'READ').length;
        const writes = this.operations.filter(op => op.type === 'WRITE').length;
        const updates = this.operations.filter(op => op.type === 'UPDATE').length;
        const deletes = this.operations.filter(op => op.type === 'DELETE').length;

        const tablesUsed = [...new Set(this.operations.map(op => op.table))];
        const recordsCreated = this.operations.filter(op => op.type === 'WRITE').length;

        return {
            totalOperations: this.operations.length,
            reads,
            writes,
            updates,
            deletes,
            tablesUsed,
            recordsCreated,
            operations: this.operations.map(op => ({
                type: op.type,
                table: op.table,
                timestamp: op.timestamp
            }))
        };
    }

    // Get current state
    getCurrentState(): Record<string, any[]> {
        return JSON.parse(JSON.stringify(this.data));
    }

    // Reset for new conversation
    reset(initialSchema?: Record<string, any[]>) {
        this.operations = [];
        if (initialSchema) {
            this.data = JSON.parse(JSON.stringify(initialSchema));
        }
    }
}

// Global registry of databases per conversation
const databaseRegistry = new Map<string, MockDatabase>();

export const initializeDatabaseForConversation = (conversationId: string, initialSchema: Record<string, any[]>): MockDatabase => {
    const db = new MockDatabase(initialSchema);
    db.setConversationId(conversationId);
    databaseRegistry.set(conversationId, db);
    console.log(`🗄️ [DB Mock] Initialized database for conversation: ${conversationId}`);
    return db;
};

export const getDatabaseForConversation = (conversationId: string): MockDatabase | undefined => {
    return databaseRegistry.get(conversationId);
};

export const cleanupDatabase = (conversationId: string): void => {
    databaseRegistry.delete(conversationId);
    console.log(`🗑️ [DB Mock] Cleaned up database for conversation: ${conversationId}`);
};

export const getAllDatabaseSummaries = (): Map<string, DatabaseOperationSummary> => {
    const summaries = new Map<string, DatabaseOperationSummary>();
    databaseRegistry.forEach((db, conversationId) => {
        summaries.set(conversationId, db.getSummary());
    });
    return summaries;
};
