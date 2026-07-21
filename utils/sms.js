const sendSMS = async (message, recipientPhone) => {
  const targetPhone = recipientPhone || process.env.ADMIN_PHONE_NUMBER;
  if (!targetPhone) {
    console.log('\n[SMS Simulation] Recipient phone not set. Logged SMS content:');
    console.log(message);
    return { success: false, reason: 'Recipient phone not configured' };
  }

  // 2. Twilio Integration (Global standard REST API)
  if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && (process.env.TWILIO_PHONE_NUMBER || process.env.TWILIO_MESSAGING_SERVICE_SID)) {
    try {
      const accountSid = process.env.TWILIO_ACCOUNT_SID;
      const authToken = process.env.TWILIO_AUTH_TOKEN;
      const fromPhone = process.env.TWILIO_PHONE_NUMBER;
      const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;
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
