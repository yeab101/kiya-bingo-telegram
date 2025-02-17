const TelegramBot = require("node-telegram-bot-api");
const User = require("../models/userModel");
const path = require('path');
const transactionHandlers = require("./transactionHandler");
const historyHandlers = require("./historyHandler");

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
      caption: "Welcome to Kiya Bingo! Choose an option below.",
      reply_markup: {
        inline_keyboard: [
          [{ text: "Play 🎮", callback_data: "play" }, { text: "Register 👤", callback_data: "register" }],
          [{ text: "Balance 💰", callback_data: "balance" },{ text: "Transfer Balance 💳", callback_data: "transfer" },],
          [{ text: "Instructions ℹ️", web_app: { url: `${baseUrl}/how-to-play` } }, { text: "History 📜", callback_data: "history" }],
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
                    [
                        { text: "🎮 Play Demo", web_app: { url: `${baseUrl}/board/0/${chatId}` } }
                    ]
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
          await bot.sendMessage(chatId, "You are now registered!. /deposit or /play");
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

 


  transfer: async (chatId) => {
    await transactionHandlers.transfer(chatId, bot);
  },

  history: async (chatId) => {
    await historyHandlers.showHistory(chatId, bot);
  },

};

// Command mappings
const commandMappings = {
  '/start': 'sendMainMenu',
  '/play': 'play',
  '/register': 'register',
  '/balance': 'checkBalance', 
  '/transfer': 'transfer',
  '/history': 'history'
};

// Register text commands
Object.entries(commandMappings).forEach(([command, handler]) => {
  bot.onText(new RegExp(command), (msg) => commandHandlers[handler](msg.chat.id));
});

const callbackActions = {
  play: commandHandlers.play,
  register: commandHandlers.register,
  balance: commandHandlers.checkBalance, 
  transfer: commandHandlers.transfer,
  history: commandHandlers.history
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