/**
 * 💰 Cost Tracker - Tracking exacto de costos de API
 * 
 * Este módulo rastrea TODOS los costos de manera precisa para:
 * 1. Saber cuánto cuesta cada auditoría
 * 2. Implementar sistema de tokens/créditos
 * 3. Escalar a 100+ bots simultáneos con billing correcto
 */

// 💲 PRECIOS OFICIALES DE GEMINI (actualizado Oct 2024)
// Fuente: https://ai.google.dev/pricing
const GEMINI_PRICING = {
    // Gemini 1.5 Flash (más barato, recomendado)
    'gemini-1.5-flash': {
        input: 0.075 / 1_000_000,    // $0.075 por 1M tokens de input
        output: 0.30 / 1_000_000,    // $0.30 por 1M tokens de output
    },
    // Gemini 1.5 Pro (más caro, más potente)
    'gemini-1.5-pro': {
        input: 1.25 / 1_000_000,     // $1.25 por 1M tokens de input
        output: 5.00 / 1_000_000,    // $5.00 por 1M tokens de output
    },
    // Gemini 2.0 Flash (nuevo, barato)
    'gemini-2.0-flash': {
        input: 0.075 / 1_000_000,
        output: 0.30 / 1_000_000,
    }
};

interface TokenUsage {
    promptTokens: number;
    responseTokens: number;
    totalTokens: number;
    model: string;
    operation: string;  // 'generate_test_cases', 'generate_message', 'analyze_result', etc.
    timestamp: number;
    conversationId?: string;
}

interface CostSummary {
    totalCostUSD: number;
    totalTokens: number;
    promptTokens: number;
    responseTokens: number;
    // 🔥 NUEVO: Desglose por tipo
    systemCostUSD: number;      // Costos del sistema (test cases, análisis)
    webhookCostUSD: number;     // Costos del webhook del usuario (sus llamadas)
    operations: {
        [operation: string]: {
            count: number;
            tokens: number;
            cost: number;
            isWebhook: boolean;  // ← NUEVO
        }
    };
    perConversation: {
        [conversationId: string]: {
            tokens: number;
            cost: number;
        }
    };
}

class CostTracker {
    private usages: TokenUsage[] = [];
    private auditStartTime: number = 0;
    private model: string = 'gemini-1.5-flash'; // Por defecto
    
    /**
     * Iniciar tracking para una nueva auditoría
     */
    startAudit(model: string = 'gemini-1.5-flash') {
        this.usages = [];
        this.auditStartTime = Date.now();
        this.model = model;
        console.log(`💰 [Cost Tracker] Iniciando tracking para modelo: ${model}`);
    }
    
    /**
     * Registrar uso de tokens (llamar DESPUÉS de cada llamada a Gemini)
     */
    recordUsage(usage: Omit<TokenUsage, 'timestamp'>) {
        const fullUsage: TokenUsage = {
            ...usage,
            timestamp: Date.now()
        };
        this.usages.push(fullUsage);
        
        // Log en tiempo real
        const cost = this.calculateCost(fullUsage);
        console.log(`💰 [${usage.operation}] ${fullUsage.totalTokens} tokens → $${cost.toFixed(6)}`);
    }
    
    /**
     * Calcular costo de un uso específico
     */
    private calculateCost(usage: TokenUsage): number {
        const pricing = GEMINI_PRICING[usage.model as keyof typeof GEMINI_PRICING] || GEMINI_PRICING['gemini-1.5-flash'];
        const inputCost = usage.promptTokens * pricing.input;
        const outputCost = usage.responseTokens * pricing.output;
        return inputCost + outputCost;
    }
    
    /**
     * Obtener resumen completo de costos
     */
    getSummary(): CostSummary {
        const summary: CostSummary = {
            totalCostUSD: 0,
            totalTokens: 0,
            promptTokens: 0,
            responseTokens: 0,
            systemCostUSD: 0,
            webhookCostUSD: 0,
            operations: {},
            perConversation: {}
        };
        
        // Operaciones del SISTEMA (nuestras)
        const systemOperations = new Set([
            'generate_sample_payload',
            'suggest_audit_criteria', 
            'generate_test_cases',
            'generate_user_message',
            'check_goal_achieved',
            'analyze_result',
            'suggest_improvements',
            'visual_agent_execution'
        ]);
        
        for (const usage of this.usages) {
            const cost = this.calculateCost(usage);
            const isSystemOp = systemOperations.has(usage.operation);
            
            // Total general
            summary.totalCostUSD += cost;
            summary.totalTokens += usage.totalTokens;
            summary.promptTokens += usage.promptTokens;
            summary.responseTokens += usage.responseTokens;
            
            // 🔥 Desglose: Sistema vs Webhook del Usuario
            if (isSystemOp) {
                summary.systemCostUSD += cost;
            } else {
                summary.webhookCostUSD += cost;
            }
            
            // Por operación
            if (!summary.operations[usage.operation]) {
                summary.operations[usage.operation] = {
                    count: 0,
                    tokens: 0,
                    cost: 0,
                    isWebhook: !isSystemOp  // ← NUEVO
                };
            }
            summary.operations[usage.operation].count++;
            summary.operations[usage.operation].tokens += usage.totalTokens;
            summary.operations[usage.operation].cost += cost;
            
            // Por conversación (si aplica)
            if (usage.conversationId) {
                if (!summary.perConversation[usage.conversationId]) {
                    summary.perConversation[usage.conversationId] = {
                        tokens: 0,
                        cost: 0
                    };
                }
                summary.perConversation[usage.conversationId].tokens += usage.totalTokens;
                summary.perConversation[usage.conversationId].cost += cost;
            }
        }
        
        return summary;
    }
    
    /**
     * Imprimir resumen formateado
     */
    printSummary() {
        const summary = this.getSummary();
        const duration = Date.now() - this.auditStartTime;
        
        console.log('\n' + '='.repeat(80));
        console.log('💰 RESUMEN DE COSTOS DE AUDITORÍA');
        console.log('='.repeat(80));
        console.log(`⏱️  Duración: ${(duration / 1000).toFixed(1)}s`);
        console.log(`🤖 Modelo: ${this.model}`);
        console.log(`\n📊 TOTALES:`);
        console.log(`   Costo Total: $${summary.totalCostUSD.toFixed(6)} USD`);
        console.log(`   Tokens Totales: ${summary.totalTokens.toLocaleString()}`);
        console.log(`   - Input: ${summary.promptTokens.toLocaleString()} tokens`);
        console.log(`   - Output: ${summary.responseTokens.toLocaleString()} tokens`);
        console.log(`\n🔥 DESGLOSE DE COSTOS:`);
        console.log(`   💰 Sistema (nuestro): $${summary.systemCostUSD.toFixed(6)} USD`);
        console.log(`   💵 Webhook (usuario): $${summary.webhookCostUSD.toFixed(6)} USD`);
        
        console.log(`\n📋 POR OPERACIÓN:`);
        for (const [operation, data] of Object.entries(summary.operations)) {
            console.log(`   ${operation}:`);
            console.log(`      ${data.count} llamadas | ${data.tokens.toLocaleString()} tokens | $${data.cost.toFixed(6)}`);
        }
        
        if (Object.keys(summary.perConversation).length > 0) {
            console.log(`\n💬 POR CONVERSACIÓN:`);
            for (const [convId, data] of Object.entries(summary.perConversation)) {
                console.log(`   ${convId}: ${data.tokens.toLocaleString()} tokens → $${data.cost.toFixed(6)}`);
            }
        }
        
        console.log('='.repeat(80) + '\n');
    }
    
    /**
     * Calcular costo estimado para N conversaciones con M turnos
     */
    static estimateCost(options: {
        numConversations: number;
        turnsPerConversation: number;
        model?: string;
        avgTokensPerMessage?: number;
    }): number {
        const {
            numConversations,
            turnsPerConversation,
            model = 'gemini-1.5-flash',
            avgTokensPerMessage = 300  // Estimación conservadora
        } = options;
        
        const pricing = GEMINI_PRICING[model as keyof typeof GEMINI_PRICING];
        
        // Estimación:
        // - 1 generación de test cases (una vez)
        // - N conversaciones × M turnos × generación de mensaje
        // - N conversaciones × análisis final
        
        const testCaseGenerationTokens = 2000;  // Una sola vez
        const messageGenerationTokensPerTurn = avgTokensPerMessage * 2; // Input + Output
        const finalAnalysisTokens = 1500; // Por conversación
        
        const totalTokens = 
            testCaseGenerationTokens +
            (numConversations * turnsPerConversation * messageGenerationTokensPerTurn) +
            (numConversations * finalAnalysisTokens);
        
        // Asumimos 60% input, 40% output (conservador)
        const inputTokens = totalTokens * 0.6;
        const outputTokens = totalTokens * 0.4;
        
        const cost = (inputTokens * pricing.input) + (outputTokens * pricing.output);
        
        return cost;
    }
}

// Singleton global
const globalCostTracker = new CostTracker();

export { globalCostTracker as costTracker, CostTracker, GEMINI_PRICING };
export type { TokenUsage, CostSummary };

/**
 * 📝 EJEMPLOS DE USO:
 * 
 * // 1. Al inicio de la auditoría:
 * costTracker.startAudit('gemini-1.5-flash');
 * 
 * // 2. Después de CADA llamada a Gemini:
 * const response = await ai.generateContent(...);
 * costTracker.recordUsage({
 *     promptTokens: response.usageMetadata.promptTokens,
 *     responseTokens: response.usageMetadata.candidatesTokens,
 *     totalTokens: response.usageMetadata.totalTokens,
 *     model: 'gemini-1.5-flash',
 *     operation: 'generate_message',
 *     conversationId: 'TC-001'
 * });
 * 
 * // 3. Al final:
 * costTracker.printSummary();
 * const summary = costTracker.getSummary();
 * 
 * // 4. Estimación previa:
 * const estimatedCost = CostTracker.estimateCost({
 *     numConversations: 100,
 *     turnsPerConversation: 12,
 *     model: 'gemini-1.5-flash'
 * });
 * console.log(`Costo estimado: $${estimatedCost.toFixed(4)}`);
 */

