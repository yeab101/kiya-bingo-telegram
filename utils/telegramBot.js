const TelegramBot = require("node-telegram-bot-api");
const User = require("../models/userModel");
const Finance = require("../models/financeModel");
const path = require('path');
const transactionHandlers = require("./transactionHandler");
const historyHandlers = require("./historyHandler");
const verifyTransaction = require("./verifyTransaction");
const verifyTransactionCbeBank = require("./verifyTransactionCbeBank");
const Tesseract = require('tesseract.js');
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

// Add temporary storage for file IDs
const pendingImages = new Map();

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

      // Show channel selection buttons
      await bot.sendMessage(chatId, "💳 Please select your preferred payment method:", {
        reply_markup: {
          inline_keyboard: [
            [{ text: "📱 Telebirr", callback_data: "deposit_telebirr" }],
            [{ text: "🏦 CBE Bank", callback_data: "deposit_cbe" }]
          ]
        }
      });
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

  image: async (chatId) => {
    await bot.sendMessage(chatId, "📸 Please send or forward an image containing text to extract.");
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
  '/txcheckercbe': 'txCheckerCbeBank',
  '/image': 'image'
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
  deposit_telebirr: async (chatId) => {
    try {
      await bot.sendMessage(chatId, "📱Please enter your Telebirr phone number you will use to deposit");
      
      const phoneHandler = async (msg) => {
        const phoneNumber = msg.text.trim(); 

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
✅ Deposit to this account 0995056029 and send screenshot or verify using one of the buttons below
━━━━━━━━━━━━━━━━━━━━━━
📱 Phone: ${phoneNumber}
💰 Amount: ${amount} ETB
🔢 Transaction ID: ${transactionId}
⏳ Status: Pending Approval
━━━━━━━━━━━━━━━━━━━━━━
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
  deposit_cbe: async (chatId) => {
    try {
      await bot.sendMessage(chatId, "🏦Please enter your CBE Bank account number you will use to deposit");
      
      const accountHandler = async (msg) => {
        const accountNumber = msg.text.trim(); 

        // Remove the account handler
        bot.removeListener('message', accountHandler);

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
              paymentMethod: 'CBE Bank',
              phoneNumber: accountNumber
            });

            await deposit.save();

            // Send confirmation message with verification buttons
            const message = `
✅ Deposit to this 1000278386094 Account and send screenshot or txCheck
━━━━━━━━━━━━━━━━━━━━━━
🏦 Account: ${accountNumber}
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

      bot.once('message', accountHandler);
    } catch (error) {
      console.error('Error in deposit handler:', error);
      await bot.sendMessage(chatId, "❌ An error occurred. Please try again later.");
    }
  },
  withdraw_telebirr: (chatId) => commandHandlers.handleWithdrawalMethod(chatId, "Telebirr"),
  withdraw_cbe: (chatId) => commandHandlers.handleWithdrawalMethod(chatId, "CBE Bank"),
  process_telebirr: async (chatId, imageId) => {
    const imageData = pendingImages.get(imageId);
    if (!imageData) {
      await bot.sendMessage(chatId, "❌ Image processing timeout. Please send the image again.");
      return;
    }
    await handleImage(chatId, imageData.fileId);
    pendingImages.delete(imageId); // Clean up after processing
  },
  process_cbe: async (chatId, imageId) => {
    const imageData = pendingImages.get(imageId);
    if (!imageData) {
      await bot.sendMessage(chatId, "❌ Image processing timeout. Please send the image again.");
      return;
    }
    await handleImageCbe(chatId, imageData.fileId);
    pendingImages.delete(imageId); // Clean up after processing
  }
};

// Handle photo messages
bot.on('photo', async (msg) => {
  const chatId = msg.chat.id;
  const photo = msg.photo[msg.photo.length - 1]; // Get the highest quality photo
  
  // Generate a unique ID for this image
  const imageId = Date.now().toString();
  
  // Store the file ID
  pendingImages.set(imageId, {
    fileId: photo.file_id,
    timestamp: Date.now()
  });

  // Clean up old entries (older than 5 minutes)
  for (const [id, data] of pendingImages.entries()) {
    if (Date.now() - data.timestamp > 5 * 60 * 1000) {
      pendingImages.delete(id);
    }
  }
  
  // Send selection buttons
  await bot.sendMessage(chatId, "📸 Please select the transaction type:", {
    reply_markup: {
      inline_keyboard: [
        [
          { 
            text: "📱 Telebirr", 
            callback_data: `tel:${imageId}` 
          },
          { 
            text: "🏦 CBE to CBE", 
            callback_data: `cbe:${imageId}` 
          }
        ]
      ]
    }
  });
});

// Update callback query handler
bot.on('callback_query', async (callbackQuery) => {
  const chatId = callbackQuery.message.chat.id;
  const action = callbackQuery.data;

  try {
    if (action.startsWith('tel:')) {
      const imageId = action.split(':')[1];
      await callbackActions.process_telebirr(chatId, imageId);
    } else if (action.startsWith('cbe:')) {
      const imageId = action.split(':')[1];
      await callbackActions.process_cbe(chatId, imageId);
    } else {
      const handler = callbackActions[action];
      if (handler) {
        await handler(chatId);
      } else {
        console.log(`Unhandled callback data: ${action}`);
      }
    }
  } catch (error) {
    console.error('Error handling callback:', error);
    await bot.sendMessage(chatId, "❌ An error occurred. Please try again.");
  }
});

// Add new image handler
const handleImage = async (chatId, fileId) => {
  try {
    // Send processing message
    const processingMsg = await bot.sendMessage(chatId, "🔄 Processing image... Please wait.");
    
    // Get file path
    const file = await bot.getFile(fileId);
    const fileUrl = `https://api.telegram.org/file/bot${process.env.TELEGRAMBOTTOKEN}/${file.file_path}`;
    
    // Perform OCR
    const result = await Tesseract.recognize(
      fileUrl,
      'eng',
      { logger: m => console.log(m) }
    );
    
    // Delete processing message
    await bot.deleteMessage(chatId, processingMsg.message_id);
    
    // Process and clean the text
    const rawText = result.data.text;
    if (!rawText.trim()) {
      await bot.sendMessage(chatId, "❌ No text could be extracted from the image.");
      return;
    }

    // Clean the text
    const cleanedText = rawText
      .replace(/[^\w\s\d\-:./@]/g, '') // Remove special characters except essential ones
      .replace(/\s+/g, ' ') // Replace multiple spaces with single space
      .trim();

    // Try different patterns to find transaction number
    const patterns = [
      /Transaction Number\s*([A-Z0-9]+)/i,
      /Transaction\s*#\s*([A-Z0-9]+)/i,
      /Transaction ID\s*([A-Z0-9]+)/i,
      /Transaction\s*([A-Z0-9]{8,})/i, // Fallback for any 8+ character alphanumeric after "Transaction"
      /([A-Z0-9]{8,})/ // Last resort: any 8+ character alphanumeric
    ];

    let transactionNumber = null;
    for (const pattern of patterns) {
      const match = cleanedText.match(pattern);
      if (match && match[1]) {
        transactionNumber = match[1];
        break;
      }
    }

    if (transactionNumber) {
      const fullUrl = `https://transactioninfo.ethiotelecom.et/receipt/${transactionNumber}`;
      // Instead of just sending the URL, use the transaction checker
      // bot.sendMessage(chatId, `full url: ${fullUrl}`);
      await verifyTransaction(fullUrl, chatId, bot);
    } else {
      await bot.sendMessage(chatId, "❌ Could not find a transaction number in the image. Please try again with a clearer image.");
    }

  } catch (error) {
    console.error('Error processing image:', error);
    await bot.sendMessage(chatId, "❌ An error occurred while processing the image. Please try again.");
  }
};

// Add new image handler for CBE
const handleImageCbe = async (chatId, fileId) => {
  try {
    // Send processing message
    const processingMsg = await bot.sendMessage(chatId, "🔄 Processing CBE image... Please wait.");
    
    // Get file path
    const file = await bot.getFile(fileId);
    const fileUrl = `https://api.telegram.org/file/bot${process.env.TELEGRAMBOTTOKEN}/${file.file_path}`;
    
    // Perform OCR
    const result = await Tesseract.recognize(
      fileUrl,
      'eng',
      { logger: m => console.log(m) }
    );
    
    // Delete processing message
    await bot.deleteMessage(chatId, processingMsg.message_id);
    
    // Process and clean the text
    const rawText = result.data.text;
    if (!rawText.trim()) {
      await bot.sendMessage(chatId, "❌ No text could be extracted from the CBE image.");
      return;
    }

    // Clean the text
    const cleanedText = rawText
      .replace(/[^\w\s\d\-:./@]/g, '') // Remove special characters except essential ones
      .replace(/\s+/g, ' ') // Replace multiple spaces with single space
      .trim();

    // Extract transaction ID using regex
    const transactionPattern = /FT[A-Z0-9]{10}/;
    const match = cleanedText.match(transactionPattern);

    if (match) {
      const transactionId = match[0];
      const fullUrl = `https://apps.cbe.com.et:100/?id=${transactionId}78386094`;
      // await bot.sendMessage(chatId, `${fullUrl}`);
      await verifyTransactionCbeBank(chatId, bot, `${fullUrl}`);
    } else {
      await bot.sendMessage(chatId, "❌ Could not find a transaction ID in the format 'FT' followed by 10 alphanumeric characters. Please try again with a clearer image.");
    }

  } catch (error) {
    console.error('Error processing CBE image:', error);
    await bot.sendMessage(chatId, "❌ An error occurred while processing the CBE image. Please try again.");
  }
};

module.exports = bot; 