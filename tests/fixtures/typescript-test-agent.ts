/**
 * 🤖 Test TypeScript Agent - Simple Bot para Testing
 * 
 * Simula un bot de soporte al cliente que:
 * - Recibe consultas de usuarios
 * - Responde con asistencia
 * - Envía emails de confirmación
 * - Guarda conversación en BD
 */

import express, { Request, Response } from 'express';

const app = express();
app.use(express.json());

// 🛠️ Tipos
interface ConversationPayload {
  conversationId: string;
  userName: string;
  userEmail: string;
  userMessage: string;
  issue: 'billing' | 'technical' | 'general';
}

interface SupportResponse {
  conversationId: string;
  response: string;
  actionTaken: string;
  ticketNumber: string;
}

// 📋 System Prompt
const SYSTEM_PROMPT = `You are a professional customer support agent. 
Your role is to:
1. Understand customer issues
2. Provide empathetic, helpful responses
3. Offer concrete solutions
4. Take appropriate actions (send email, create ticket)

Always be courteous and professional.`;

/**
 * 🎯 Main Handler - Process customer support request
 * 
 * Implements:
 * - Analyze customer message
 * - Generate response
 * - Send confirmation email
 * - Save to database
 * - Return ticket number
 */
app.post('/webhook/support', async (req: Request, res: Response) => {
  try {
    const payload: ConversationPayload = req.body;

    // Validate input
    if (!payload.conversationId || !payload.userMessage) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // 🧠 Generate response (simulated AI)
    const response = await generateSupportResponse(payload);

    // 📧 Send confirmation email
    await sendConfirmationEmail(payload.userEmail, response.ticketNumber);

    // 💾 Save to database
    await saveToDatabase({
      conversationId: payload.conversationId,
      userName: payload.userName,
      userEmail: payload.userEmail,
      issueType: payload.issue,
      message: payload.userMessage,
      response: response.response,
      ticketNumber: response.ticketNumber,
      timestamp: new Date(),
    });

    // Return response
    res.json(response);
  } catch (error: any) {
    console.error('Error processing request:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * 🤖 Generate Support Response
 * 
 * In real app, calls OpenAI API with system prompt.
 * For testing, returns simulated response.
 */
async function generateSupportResponse(
  payload: ConversationPayload
): Promise<SupportResponse> {
  const ticketNumber = `TKT-${Date.now()}`;

  // Simulated responses
  const responses: Record<string, string> = {
    billing: 'I understand your billing concern. I can help you resolve this. Please allow 24-48 hours for processing.',
    technical:
      'Thank you for reporting this technical issue. Our team is investigating. We will update you within 2 hours.',
    general: 'Thank you for reaching out. I am here to assist you with any questions.',
  };

  return {
    conversationId: payload.conversationId,
    response: responses[payload.issue] || responses.general,
    actionTaken: `Created ticket #${ticketNumber}`,
    ticketNumber,
  };
}

/**
 * 📧 Send Confirmation Email
 * 
 * In real app, calls SendGrid/Gmail API.
 * For testing, simulates success.
 */
async function sendConfirmationEmail(email: string, ticketNumber: string): Promise<void> {
  console.log(`📧 Sending email to ${email} for ticket ${ticketNumber}`);
  // In real: await sendgrid.send({ to: email, subject: ..., text: ... })
  // For testing: simulate success
  return Promise.resolve();
}

/**
 * 💾 Save to Database
 * 
 * Stores conversation record.
 * For testing, logs to console.
 */
async function saveToDatabase(record: any): Promise<void> {
  console.log(`💾 Saving to database:`, record);
  // In real: await supabase.from('conversations').insert(record)
  // For testing: simulate success
  return Promise.resolve();
}

// 🚀 Start server
const PORT = 3001;
app.listen(PORT, () => {
  console.log(`✅ Support bot running on port ${PORT}`);
  console.log(`   Endpoint: http://localhost:${PORT}/webhook/support`);
});

export { app, generateSupportResponse, sendConfirmationEmail, saveToDatabase };
