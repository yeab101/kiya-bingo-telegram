const verifyBankTransaction = require("../cbebank");
const Finance = require("../models/financeModel");
const User = require("../models/userModel");
const adminReceiverAccount = "6094"
const adminReceiverAccount2 = "6094"
const ADMIN_CHAT_ID = "1982046925";

const verifyTransactionCbeBank = async (chatId, bot, providedTxId) => {
    if (!providedTxId) {
        await bot.sendMessage(chatId, "🔍 Please enter the CBE Bank transaction reference number (e.g., FT25140X24J7):");
    } 
    const messageHandler = async (msg) => {
        const txId = providedTxId || msg.text.trim();
        let processingMessage = '';

        // Remove the message listener to prevent multiple responses
        if (!providedTxId) {
            bot.removeListener('message', messageHandler);
        }

        try {
            const result = await verifyBankTransaction(txId);

            await bot.sendMessage(chatId, `${providedTxId}`);
            // Validate receiver account
            const receiverAccountStr = result.receiverAccount.toString();
            if (receiverAccountStr !== adminReceiverAccount && receiverAccountStr !== adminReceiverAccount2) {
                throw new Error(`Invalid receiver account`);
            }

            // Check if transaction reference already exists
            const existingTransaction = await Finance.findOne({
                refrenceIdExternal: result.reference
            });

            if (existingTransaction) {
                await bot.sendMessage(chatId, "❌ This transaction has already been processed. Please check another transaction.");
                return;
            }

            // Check for pending transaction with matching amount
            const pendingTransaction = await Finance.findOne({
                chatId: chatId.toString(),
                amount: result.transferredAmount,
                status: 'PENDING_APPROVAL',
                type: 'deposit'
            });

            if (!pendingTransaction) { 
                await bot.sendMessage(chatId, "❌ No pending transaction found.");
                return;
            }
            // If pending transaction exists, process it
            if (pendingTransaction) {
                // Validate if amounts match exactly
                if (pendingTransaction.amount !== result.transferredAmount) { 
                    await bot.sendMessage(chatId, `❌ Amount mismatch!`);
                    return;
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

                        // Send the processing message to the user
                        await bot.sendMessage(chatId, processingMessage, { parse_mode: 'Markdown' });
                    }
                } catch (error) {
                    console.error('Error processing pending transaction:', error);
                    processingMessage = '❌ Error processing your deposit. Please contact support.';
                    // Send the error message to the user
                    await bot.sendMessage(chatId, processingMessage);
                }
            }

            const message = `
✅ *CBE Bank Transaction Details*
━━━━━━━━━━━━━━━━━━━━━━
👤 Payer: ${result.payer}
📱 Payer Account: ${result.payerAccount}
👥 Receiver: ${result.receiver}
📱 Receiver Account: ${result.receiverAccount}
💰 Amount: ${result.transferredAmount} ETB
📅 Date: ${new Date(result.paymentDate).toLocaleString()}
🔢 Reference: ${result.reference}
━━━━━━━━━━━━━━━━━━━━━━`;

            await bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
        } catch (error) {
            console.error('Error verifying CBE transaction:', error);
            const errorMessage = error.message.includes('Invalid receiver account')
                ? "❌ This transaction is not for our account. Please check the transaction reference."
                : "❌ Error verifying transaction. Please check the reference number and try again.";
            await bot.sendMessage(chatId, errorMessage);
        }
    };

    // Add message listener only if no transaction ID was provided
    if (!providedTxId) {
        bot.once('message', messageHandler);
    } else {
        // If transaction ID was provided, process it immediately
        await messageHandler({ text: providedTxId });
    }
};

module.exports = verifyTransactionCbeBank;
