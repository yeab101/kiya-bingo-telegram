const mongoose = require("mongoose");

async function connectToDatabase(mongoUrl) {
  try {
    await mongoose.connect(mongoUrl);
    console.log("Connected to MongoDB");
  } catch (error) {
    console.error("Error connecting to MongoDB", error);
  }
}

module.exports = connectToDatabase;
