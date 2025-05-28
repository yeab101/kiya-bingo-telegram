const TelegramBot = require("node-telegram-bot-api");
const User = require("../models/userModel");
const Finance = require("../models/financeModel");
const path = require('path');
const transactionHandlers = require("./transactionHandler");
const historyHandlers = require("./historyHandler");
const verifyTransaction = require("./verifyTransaction");
const verifyTransactionCbeBank = require("./verifyTransactionCbeBank");
const bot = new TelegramBot(process.env.TELEGRAMBOTTOKEN, { polling: true });
const baseUrl = "https://kiya-bingo-frontend.vercel.app"

// Add at the top with other utilities
const errorHandler = async (operation, chatId, errorMsg = "An error occurred") => {
  try {
    return await operation();
  } catch (error) {
    console.error(`Error: ${errorMsg}:`, error);
    await bot.sendMessage(chatId, errorMsg);
    return null;
  }
};

// Command handlers object to group related functions
const commandHandlers = {
  // Menu handling
  sendMainMenu: async (chatId) => {
    const imagePath = path.join(__dirname, 'menu.jpg');
    await bot.sendPhoto(chatId, imagePath, {
      caption: "Welcome to Super Bingo! Choose an option below.",
      reply_markup: {
        inline_keyboard: [
          [{ text: "Play 🎮", callback_data: "play" }, { text: "Register 👤", callback_data: "register" }],
          [{ text: "Deposit 💰", callback_data: "deposit" }, { text: "Withdraw 💸", callback_data: "withdrawal" }],
          [{ text: "Check Telebirr Deposit", callback_data: "txChecker" }, { text: "Check CBE Deposit", callback_data: "txCheckerCbeBank" }],
          [{ text: "Balance 💰", callback_data: "balance" },{ text: "Transfer Balance 💳", callback_data: "transfer" },],
          [{ text: "How to play 🎮", web_app: { url: `${baseUrl}/how-to-play` } }, { text: "History 📜", callback_data: "history" }],
        ]
      }
    });
  },

  // Game related handlers
  play: async (chatId) => {
    try {
        // Check if user exists in database
        const user = await User.findOne({ chatId });
        
        if (!user) {
            return bot.sendMessage(
                chatId, 
                "⚠️ Please register first /register to start playing."
            );
        }

        // If user exists, proceed with sending game options
        await bot.sendMessage(chatId, "🎮 Best of luck on your gaming adventure!", {
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: "🎮 Play 10", web_app: { url: `${baseUrl}/board/10/${chatId}` } }, 
                        { text: "🎮 Play 20", web_app: { url: `${baseUrl}/board/20/${chatId}` } }
                    ],
                    [
                        { text: "🎮 Play 50", web_app: { url: `${baseUrl}/board/50/${chatId}` } }, 
                        { text: "🎮 Play 100", web_app: { url: `${baseUrl}/board/100/${chatId}` } }
                    ],
                    // [
                    //     { text: "🎮 Play Demo", web_app: { url: `${baseUrl}/board/0/${chatId}` } }
                    // ]
                ]
            }
        });
    } catch (error) {
        console.error('Error in play handler:', error);
        await bot.sendMessage(
            chatId, 
            "❌ Sorry, something went wrong. Please try again later."
        );
    }
  },

  // User account handlers
  register: async (chatId) => {
    await bot.sendMessage(chatId, "Please enter your phone number (10 digits, starting with '09' or '07'):");
    bot.once('message', async (msg) => {
      const phoneNumber = msg.text;
      const phoneRegex = /^09\d{8}$/;

      if (!phoneRegex.test(phoneNumber)) {
        await bot.sendMessage(chatId, "Ensure phone number is 10 digits and starts with '09xxxxxxxx'.");
        return;
      }

      const username = msg.from.username;
      if (!username) {
        await bot.sendMessage(chatId, "Username is required. Please set a username in your Telegram settings and try again.");
        return;
      }
      try {
        const existingUser = await User.findOne({ chatId: chatId });

        if (existingUser) {
          await bot.sendMessage(chatId, "You are already registered! Use /play to start playing.");
        } else {
          const user = new User({
            chatId: chatId,
            phoneNumber: phoneNumber,
            username: username
          });

          await user.save();
          await bot.sendMessage(chatId, "You are now registered /play");
        }
      } catch (error) {
        console.error("Error handling registration:", error);
        bot.sendMessage(chatId, "There was an error processing your registration. Please try again.");
      }
    });
  },
  checkBalance: async (chatId) => {
    return errorHandler(async () => {
      const user = await User.findOne({ chatId });
      if (!user) {
        await bot.sendMessage(chatId, "User not found. Please register first.");
        return;
      }
      await bot.sendMessage(chatId, `Your current balance is: 💰 ${user.balance}`);
    }, chatId, "Error checking balance. Please try again.");
  },

  txChecker: async (chatId) => {
    await bot.sendMessage(chatId, "🔍 Please enter the transaction URL (e.g., https://transactioninfo.ethiotelecom.et/receipt/XXXXX):");
    
    const messageHandler = async (msg) => {
      const url = msg.text.trim();
      
      // Remove the message listener to prevent multiple responses
      bot.removeListener('message', messageHandler);
      
      await verifyTransaction(url, chatId, bot);
    };

    // Add message listener
    bot.once('message', messageHandler);
  },

  txCheckerCbeBank: async (chatId) => {
    await verifyTransactionCbeBank(chatId, bot);
  },

  transfer: async (chatId) => {
    await transactionHandlers.transfer(chatId, bot);
  },

  history: async (chatId) => {
    await historyHandlers.showHistory(chatId, bot);
  },

  deposit: async (chatId) => {
    try {
      // Check if user exists
      const user = await User.findOne({ chatId });
      if (!user) {
        return bot.sendMessage(chatId, "⚠️ Please register first /register to make a deposit.");
      }

      // Ask for Telebirr phone number
      await bot.sendMessage(chatId, "Please send the payment to our 0912487230 or 0995056029 Telebirr or CBE Bank 1000113221864 or 1000278386094 account and after payment send the transaction id to TxChecker.");
      await bot.sendMessage(chatId, "📱 Please enter your Telebirr phone number or Cbe Account you will use to deposit");
      
      const phoneHandler = async (msg) => {
        const phoneNumber = msg.text.trim();
        // const phoneRegex = /^09\d{8}$/;

        // if (!phoneRegex.test(phoneNumber)) {
        //   await bot.sendMessage(chatId, "❌ Invalid phone number format. Please enter a valid Telebirr number (09xxxxxxxx).");
        //   return;
        // }

        // Remove the phone number handler
        bot.removeListener('message', phoneHandler);

        // Ask for amount
        await bot.sendMessage(chatId, "💰 Please enter the amount you want to deposit (minimum 10 ETB):");
        
        const amountHandler = async (msg) => {
          const amount = parseFloat(msg.text.trim());
          
          // Remove the amount handler
          bot.removeListener('message', amountHandler);

          if (isNaN(amount) || amount < 10) {
            await bot.sendMessage(chatId, "❌ Invalid amount. Please enter a number greater than or equal to 10 ETB.");
            return;
          }

          try {
            // Generate random 10-digit transaction ID
            const transactionId = Math.floor(1000000000 + Math.random() * 9000000000).toString();

            // Create deposit record
            const deposit = new Finance({
              transactionId,
              refrenceIdExternal: transactionId,
              chatId: chatId.toString(),
              amount,
              status: 'PENDING_APPROVAL',
              type: 'deposit',
              paymentMethod: 'Telebirr',
              phoneNumber
            });

            await deposit.save();

            // Send confirmation message with verification buttons
            const message = `
✅ *Deposit Request Submitted*
━━━━━━━━━━━━━━━━━━━━━━
📱 Phone: ${phoneNumber}
💰 Amount: ${amount} ETB
🔢 Transaction ID: ${transactionId}
⏳ Status: Pending Approval
━━━━━━━━━━━━━━━━━━━━━━

Please verify your deposit using one of the buttons below:
`;

            await bot.sendMessage(chatId, message, { 
              parse_mode: 'Markdown',
              reply_markup: {
                inline_keyboard: [
                  [
                    { text: "Check Telebirr Deposit 📱", callback_data: "txChecker" },
                    { text: "Check CBE Deposit 🏦", callback_data: "txCheckerCbeBank" }
                  ]
                ]
              }
            });
          } catch (error) {
            console.error('Error creating deposit:', error);
            await bot.sendMessage(chatId, "❌ An error occurred while processing your deposit. Please try again.");
          }
        };

        bot.once('message', amountHandler);
      };

      bot.once('message', phoneHandler);
    } catch (error) {
      console.error('Error in deposit handler:', error);
      await bot.sendMessage(chatId, "❌ An error occurred. Please try again later.");
    }
  },

  withdrawal: async (chatId) => {
    try {
      // Check if user exists
      const user = await User.findOne({ chatId });
      if (!user) {
        return bot.sendMessage(chatId, "⚠️ Please register first /register to make a withdrawal.");
      }

      // Check minimum balance
      if (user.balance < 30) {
        return bot.sendMessage(chatId, "❌ Insufficient balance. Minimum withdrawal amount is 30 ETB.");
      }

      // Ask for payment method
      await bot.sendMessage(chatId, "💳 Select your preferred payment method:", {
        reply_markup: {
          inline_keyboard: [
            [{ text: "Telebirr", callback_data: "withdraw_telebirr" }],
            [{ text: "CBE Bank", callback_data: "withdraw_cbe" }]
          ]
        }
      });
    } catch (error) {
      console.error('Error in withdrawal handler:', error);
      await bot.sendMessage(chatId, "❌ An error occurred. Please try again later.");
    }
  },

  handleWithdrawalMethod: async (chatId, paymentMethod) => {
    try {
      // Ask for account number
      await bot.sendMessage(chatId, `📱 Please enter your ${paymentMethod} account number:`);
      
      const accountHandler = async (msg) => {
        const accountNumber = msg.text.trim();
        
        // Remove the account handler
        bot.removeListener('message', accountHandler);

        // Ask for amount
        await bot.sendMessage(chatId, "💰 Please enter the amount you want to withdraw (minimum 30 ETB):");
        
        const amountHandler = async (msg) => {
          const amount = parseFloat(msg.text.trim());
          
          // Remove the amount handler
          bot.removeListener('message', amountHandler);

          if (isNaN(amount) || amount < 30) {
            await bot.sendMessage(chatId, "❌ Invalid amount. Please enter a number greater than or equal to 30 ETB.");
            return;
          }

          try {
            // Check if user has sufficient balance
            const user = await User.findOne({ chatId });
            if (user.balance < amount) {
              await bot.sendMessage(chatId, "❌ Insufficient balance for this withdrawal.");
              return;
            }

            // Deduct balance from user account
            user.balance -= amount;
            await user.save();

            // Generate random 10-digit transaction ID
            const transactionId = Math.floor(1000000000 + Math.random() * 9000000000).toString();

            // Create withdrawal record
            const withdrawal = new Finance({
              transactionId,
              refrenceIdExternal: transactionId,
              chatId: chatId.toString(),
              amount,
              status: 'PENDING_APPROVAL',
              type: 'withdrawal',
              paymentMethod,
              phoneNumber: accountNumber
            });

            await withdrawal.save();

            // Send confirmation message
            const message = `
✅ *Withdrawal Request Submitted*
━━━━━━━━━━━━━━━━━━━━━━
💳 Payment Method: ${paymentMethod}
📱 Account Number: ${accountNumber}
💰 Amount: ${amount} ETB
💵 New Balance: ${user.balance} ETB
🔢 Transaction ID: ${transactionId}
⏳ Status: Pending Approval
━━━━━━━━━━━━━━━━━━━━━━

Your withdrawal request has been submitted and is pending approval.`;

            await bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
          } catch (error) {
            console.error('Error creating withdrawal:', error);
            await bot.sendMessage(chatId, "❌ An error occurred while processing your withdrawal. Please try again.");
          }
        };

        bot.once('message', amountHandler);
      };

      bot.once('message', accountHandler);
    } catch (error) {
      console.error('Error in withdrawal method handler:', error);
      await bot.sendMessage(chatId, "❌ An error occurred. Please try again later.");
    }
  },

};

// Command mappings
const commandMappings = {
  '/start': 'sendMainMenu',
  '/play': 'play',
  '/register': 'register', 
  '/balance': 'checkBalance',
  '/transfer': 'transfer',
  '/history': 'history',
  '/txcheckercbe': 'txCheckerCbeBank'
};

// Register text commands
Object.entries(commandMappings).forEach(([command, handler]) => {
  bot.onText(new RegExp(command), (msg) => commandHandlers[handler](msg.chat.id));
});

// Update callback actions
const callbackActions = {
  play: commandHandlers.play,
  register: commandHandlers.register, 
  balance: commandHandlers.checkBalance,
  transfer: commandHandlers.transfer,
  history: commandHandlers.history,
  txChecker: commandHandlers.txChecker,
  txCheckerCbeBank: commandHandlers.txCheckerCbeBank,
  deposit: commandHandlers.deposit,
  withdrawal: commandHandlers.withdrawal,
  withdraw_telebirr: (chatId) => commandHandlers.handleWithdrawalMethod(chatId, "Telebirr"),
  withdraw_cbe: (chatId) => commandHandlers.handleWithdrawalMethod(chatId, "CBE Bank")
};

// Handle callback queries
bot.on('callback_query', async (callbackQuery) => {
  const chatId = callbackQuery.message.chat.id;
  const action = callbackQuery.data;

  const handler = callbackActions[action];
  if (handler) {
    await handler(chatId);
  } else {
    console.log(`Unhandled callback data: ${action}`);
  }
});

module.exports = bot; 