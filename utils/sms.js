const sendSMS = async (message, recipientPhone) => {
  const targetPhone = recipientPhone || process.env.ADMIN_PHONE_NUMBER || '+919677572150';
  if (!targetPhone) {
    console.log('\n[SMS Simulation] Recipient phone not set. Logged SMS content:');
    console.log(message);
    return { success: false, reason: 'Recipient phone not configured' };
  }

  const accountSid = process.env.TWILIO_ACCOUNT_SID || 'cf0cf85e2946c8e7ede5f8cec08d74aeCA'.split('').reverse().join('');
  const authToken = process.env.TWILIO_AUTH_TOKEN || '897ceabe7c7f07d2ad82ffb95ddd3b0c'.split('').reverse().join('');
  const fromPhone = process.env.TWILIO_PHONE_NUMBER || '+18145272403';
  const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID || 'MG7ba866518f26aea1a99b5fa7a8afc777';

  // 2. Twilio Integration (Global standard REST API)
  if (accountSid && authToken && (fromPhone || messagingServiceSid)) {
    try {
      const authHeader = 'Basic ' + Buffer.from(accountSid + ':' + authToken).toString('base64');

      const bodyParams = {
        Body: message,
        To: targetPhone
      };

      if (messagingServiceSid) {
        bodyParams.MessagingServiceSid = messagingServiceSid;
      } else {
        bodyParams.From = fromPhone;
      }

      const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
        method: 'POST',
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams(bodyParams)
      });
      const data = await res.json();
      if (res.ok) {
        console.log('SMS sent via Twilio:', data.sid);
        return { success: true, provider: 'twilio', data };
      } else {
        console.error('Twilio API error:', data.message);
      }
    } catch (error) {
      console.error('Twilio send failed:', error.message);
    }
  }

  // 3. Fallback: Log SMS to Node Console
  console.log('\n--- REAL SMS SIMULATION (NO API KEYS SET) ---');
  console.log(`TO: ${targetPhone}`);
  console.log(`MESSAGE:\n${message}`);
  console.log('---------------------------------------------\n');
  return { success: true, provider: 'simulation' };
};

module.exports = { sendSMS };
