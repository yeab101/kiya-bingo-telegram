const { downloadHtml } = require("../telebirrChecker");
const Finance = require("../models/financeModel");
const User = require("../models/userModel");
const receiverAccount = "6029"; 

const ADMIN_CHAT_ID = "1982046925";

const verifyTransaction = async (url, chatId, bot, suppressErrors = false) => {
  // Validate URL format
  if (!url.startsWith('https://transactioninfo.ethiotelecom.et/receipt/')) {
    if (!suppressErrors) await bot.sendMessage(chatId, "❌ Invalid URL format. Please provide a valid transaction URL.");
    return { success: false, reason: 'invalid_url' };
  }

  try {
    // Send processing message
    const processingMsg = await bot.sendMessage(chatId, "⏳ Processing transaction details...");
    
    // Process the transaction using telebirrChecker
    const result = await downloadHtml(url, 'temp_transaction.html');
    
    // Validate receiver account last 4 digits 
    if (result.receiverAccount.slice(-4) != receiverAccount) {
      await bot.deleteMessage(chatId, processingMsg.message_id);  
      if (!suppressErrors) { 
        await bot.sendMessage(chatId, "Error: receiver account does not match our accounts. Trying again...");
      }
      return { success: false, reason: 'receiver_mismatch' };
    }

    // Check if transaction reference already exists
    const existingTransaction = await Finance.findOne({
      refrenceIdExternal: result.reference
    });

    if (existingTransaction) {
      await bot.deleteMessage(chatId, processingMsg.message_id);
      if (!suppressErrors) await bot.sendMessage(chatId, "❌ This transaction has already been processed. Please check another transaction.");
      return { success: false, reason: 'already_processed' };
    }
    
    // Check for pending transaction with matching amount
    const pendingTransaction = await Finance.findOne({
      chatId: chatId.toString(),
      amount: result.transferredAmount,
      status: 'PENDING_APPROVAL',
      type: 'deposit'
    });

    let processingMessage = '';
    
    // If pending transaction exists, process it
    if (pendingTransaction) {
      // Validate if amounts match exactly
      if (pendingTransaction.amount !== result.transferredAmount) {
        await bot.deleteMessage(chatId, processingMsg.message_id);
        if (!suppressErrors) await bot.sendMessage(chatId, `❌ Amount mismatch!`);
        return { success: false, reason: 'amount_mismatch' };
      }

      try {
        // Update the transaction document
        pendingTransaction.status = 'COMPLETED';
        pendingTransaction.refrenceIdExternal = result.reference;
        await pendingTransaction.save();

        // Update user balance
        const user = await User.findOne({ chatId: chatId.toString() });
        if (user) {
          user.balance += result.transferredAmount;
          await user.save();
          processingMessage = `
✅ *Transaction Processed Successfully!*
━━━━━━━━━━━━━━━━━━━━━━
💰 Amount: ${result.transferredAmount} ETB has been added to your balance
💳 New Balance: ${user.balance} ETB
🔢 Transaction ID: ${result.reference}
━━━━━━━━━━━━━━━━━━━━━━`;

          // Send success notification to admin
          await bot.sendMessage(ADMIN_CHAT_ID, `
🟢 *New Deposit Success*
━━━━━━━━━━━━━━━━━━━━━━
👤 User: ${user.username || 'Unknown'}
💬 Chat ID: ${chatId}
💰 Amount: ${result.transferredAmount} ETB
🔢 Transaction ID: ${result.reference}
━━━━━━━━━━━━━━━━━━━━━━`, { parse_mode: 'Markdown' });
        }
      } catch (error) {
        console.error('Error processing pending transaction:', error);
        processingMessage = '❌ Error processing your deposit. Please contact support.';
        await bot.deleteMessage(chatId, processingMsg.message_id);
        if (!suppressErrors) await bot.sendMessage(chatId, processingMessage);
        return { success: false, reason: 'processing_error' };
      }
    }

    // Format the response message
    const responseMessage = `
👤 *Transaction Details*
━━━━━━━━━━━━━━━━━━━━━━ 
• Name: ${result.payer}
• Telebirr: ****${result.payerAccount}

💰 *Transaction Info*
• Amount: ${result.transferredAmount} ETB
• Reference: ${result.reference}
• Date: ${new Date(result.paymentDate).toLocaleString()}
━━━━━━━━━━━━━━━━━━━━━━

${pendingTransaction ? processingMessage : '❌ You do not have any pending deposit order for this amount.'}`;

    // Delete processing message and send results
    await bot.deleteMessage(chatId, processingMsg.message_id);
    await bot.sendMessage(chatId, responseMessage, { parse_mode: 'Markdown' });
    return { success: true };
  } catch (error) {
    console.error('Error processing transaction:', error);
    if (!suppressErrors) await bot.sendMessage(chatId, "❌ Error processing transaction. Please check the URL and try again.");
    return { success: false, reason: 'exception' };
  }
};

module.exports = verifyTransaction; 