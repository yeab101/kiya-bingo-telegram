const mongoose = require('mongoose');
 
const financeSchema = new mongoose.Schema({
    transactionId: { type: String, unique: true, required: true },
    refrenceIdExternal: { type: String, unique: true, default: null },
    chatId: { 
        type: String, 
        required: true,
        index: true
    }, 
    amount: { type: Number, required: true },
    status: { 
        type: String, 
        enum: ['COMPLETED', 'FAILED', 'DECLINED', 'PENDING_APPROVAL'],
        required: true 
    },
    type: {
        type: String,
        enum: ['deposit', 'withdrawal', 'transfer', 'rollback'],
        required: true
    },  
    paymentMethod: { 
        type: String,  
    },
    phoneNumber: { type: String, required: true },
}, { timestamps: true });  

// Create the Finance model
const Finance = mongoose.model('Finance', financeSchema);

module.exports = Finance;