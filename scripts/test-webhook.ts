/**
 * Script para probar el webhook directamente y ver el error real
 */

const WEBHOOK_URL = 'https://obrasecots-bot.lobxn9.easypanel.host/v1/hook';

const testPayload = {
  session_id: "5491158741234",
  from: "5491158741234",
  pushName: "Test User",
  body: "Hola, quiero consultar por zócalos",
};

async function testWebhook() {
  console.log('🧪 Testing webhook:', WEBHOOK_URL);
  console.log('📦 Payload:', JSON.stringify(testPayload, null, 2));
  console.log('');

  try {
    const startTime = Date.now();
    const response = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(testPayload),
    });

    const duration = Date.now() - startTime;
    console.log(`⏱️  Response time: ${duration}ms`);
    console.log(`📊 Status: ${response.status} ${response.statusText}`);
    console.log('');

    // Try to get response as text first
    const textResponse = await response.text();
    console.log('📄 Raw response:');
    console.log(textResponse);
    console.log('');

    // Try to parse as JSON
    try {
      const jsonResponse = JSON.parse(textResponse);
      console.log('✅ JSON response:');
      console.log(JSON.stringify(jsonResponse, null, 2));
    } catch (e) {
      console.log('❌ Response is not valid JSON');
    }

  } catch (error: any) {
    console.error('❌ Error calling webhook:', error.message);
    console.error('Stack:', error.stack);
  }
}

testWebhook().then(() => {
  console.log('\n✅ Test completed');
}).catch(err => {
  console.error('\n❌ Test failed:', err);
});
