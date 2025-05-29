const Transaction = require("../models/transactionModel");
const Finance = require("../models/financeModel");

const historyHandlers = {
    showHistory: async (chatId, bot) => {
        try {
            // Fetch transactions from both models
            const [transactions, finances] = await Promise.all([
                Transaction.find({
                    $or: [
                        { chatId: chatId },
                        { recipientChatId: chatId }
                    ]
                }).sort({ updatedAt: -1 }),
                Finance.find({
                    chatId: chatId
                }).sort({ updatedAt: -1 })
            ]);

            // Combine and sort all transactions
            const allTransactions = [
                ...transactions.map(t => ({ ...t.toObject(), source: 'transaction' })),
                ...finances.map(f => ({ ...f.toObject(), source: 'finance' }))
            ].sort((a, b) => b.updatedAt - a.updatedAt)
            .slice(0, 10);

            if (!allTransactions || allTransactions.length === 0) {
                await bot.sendMessage(chatId, "No transaction history found.");
                return;
            }

            await bot.sendMessage(chatId, "Last 10 Transactions:");

            // Send each transaction as a separate message
            for (const [index, transaction] of allTransactions.entries()) {
                const date = new Date(transaction.createdAt).toLocaleDateString();
                const type = transaction?.type?.toUpperCase();
                const amount = transaction?.amount;
                const status = transaction?.status?.toUpperCase();

                let details = '';
                if (transaction.source === 'transaction') {
                    if (transaction?.type === 'withdrawal') {
                        details = ` \n ${transaction?.bankType} - ${transaction?.bankNumber}`;
                    } else if (transaction?.type === 'transfer') {
                        details = transaction?.chatId === chatId
                            ? ` \n To: ${transaction?.recipientChatId}`
                            : ` \n From: ${transaction?.chatId}`;
                    }
                } else if (transaction.source === 'finance') {
                    details = ` \n Payment Method: ${transaction?.paymentMethod}`;
                    if (transaction?.phoneNumber) {
                        details += ` \n Phone: ${transaction?.phoneNumber}`;
                    }
                }

                if (transaction?.status === 'failed' || transaction?.status === 'FAILED') {
                    details += ` \n Error: ${transaction?.errorMessage || 'Transaction failed'}`;
                }

                const message = `${index + 1}. ${date} \n ${type} \n Amount: ${amount} Birr \n Status: ${status}${details}`;

                // Add a small delay to prevent flooding
                await new Promise(resolve => setTimeout(resolve, 100));
                await bot.sendMessage(chatId, message, { parse_mode: 'HTML' });
            }
        } catch (error) {
            console.error("Error fetching history:", error);
            await bot.sendMessage(chatId, "Error fetching transaction history. Please try again.");
        }
    }
};

module.exports = historyHandlers;
