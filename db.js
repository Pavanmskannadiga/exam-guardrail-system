const mongoose = require('mongoose');

async function connectDB() {
  let uri = process.env.MONGO_URI ||
    'mongodb+srv://Pavanmsskpr:pavanmsskpr@guardril.49la4la.mongodb.net/exam-guardrail?retryWrites=true&w=majority&appName=guardril';


  await mongoose.connect(uri);
  console.log('✅ MongoDB connected');

  mongoose.connection.on('disconnected', () => {
    console.log('⚠️  MongoDB disconnected');
  });
}

module.exports = connectDB;
