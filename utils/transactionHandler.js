const User = require("../models/userModel");  
const Transaction = require("../models/transactionModel"); 

const getValidInput = async (bot, chatId, prompt, validator) => {
    while (true) {
        try {
            await bot.sendMessage(chatId, prompt);
            const response = await new Promise((resolve, reject) => {
                const messageHandler = (msg) => {
                    if (msg.chat.id === chatId) {
                        bot.removeListener('message', messageHandler);
                        resolve(msg);
                    }
                };
                bot.on('message', messageHandler);
                setTimeout(() => {
                    bot.removeListener('message', messageHandler);
                    reject(new Error('Response timeout'));
                }, 60000);
            });

            if (validator(response.text)) {
                return response.text;
            } else {
                await bot.sendMessage(chatId, "Invalid input. Please try again.");
            }
        } catch (error) {
            console.error('Error getting input:', error);
            await bot.sendMessage(chatId, "Something went wrong. Please try again.");
        }
    }
}; 
 
const transactionHandlers = { 

    transfer: async (chatId, bot) => {
        try {
            const sender = await User.findOne({ chatId });
            if (!sender) {
                await bot.sendMessage(chatId, "Please register first to transfer funds.");
                return;
            }

            const amount = await getValidInput(
                bot,
                chatId,
                "Enter amount to transfer (10 ETB - 100000 ETB):",
                (text) => {
                    const num = parseFloat(text);
                    return !isNaN(num) && num >= 10 && num <= 100000;
                }
            );

            // Check if sender has sufficient balance
            if (sender.balance < parseFloat(amount)) {
                await bot.sendMessage(chatId, "Insufficient balance for this transfer.");
                return;
            }

            const recipientPhone = await getValidInput(
                bot,
                chatId,
                "Enter recipient's phone number (format: 09xxxxxxxx):",
                (text) => /^09\d{8}$/.test(text)
            );

            // Find recipient by phone number
            const recipient = await User.findOne({ phoneNumber: recipientPhone });
            if (!recipient) {
                await bot.sendMessage(chatId, "Recipient not found. Please check the phone number and try again.");
                return;
            }

            // Prevent self-transfer
            if (recipient.chatId === chatId) {
                await bot.sendMessage(chatId, "You cannot transfer to yourself.");
                return;
            }

            // Generate transaction ID
            const transactionId = `TR${Date.now()}${Math.random().toString(36).substr(2, 4)}`;

            // Create transfer transaction record
            await new Transaction({
                transactionId,
                chatId,
                recipientChatId: recipient.chatId,
                amount: parseFloat(amount),
                status: 'completed',
                type: 'transfer'
            }).save();

            // Update balances
            sender.balance -= parseFloat(amount);
            recipient.balance += parseFloat(amount);
            await sender.save();
            await recipient.save();

            // Notify both parties
            await bot.sendMessage(
                chatId,
                `Transfer successful!\nAmount: ${amount} ETB\nTo: ${recipientPhone}\nTransaction ID: ${transactionId}`
            );
            await bot.sendMessage(
                recipient.chatId,
                `You received ${amount} ETB from ${sender.phoneNumber}\nTransaction ID: ${transactionId}`
            );

        } catch (error) {
            console.error("Error handling transfer:", error);
            await bot.sendMessage(chatId, "Error processing transfer. Please try again. /transfer");
        }
    },

};

module.exports = transactionHandlers; 