const mongoose = require('mongoose');

async function connectDB() {
  const FALLBACK_URI = 'mongodb+srv://pavanmsskpr_db_user:hackfest123@cluster0.fiujwly.mongodb.net/exam-guardrail?retryWrites=true&w=majority&appName=Cluster0';

  const envUri = process.env.MONGO_URI;
  // Only use env var if it's a valid MongoDB URI (not a placeholder)
  const uri = (envUri && envUri.startsWith('mongodb')) ? envUri : FALLBACK_URI;

  console.log('🔗 Connecting to MongoDB...');
  await mongoose.connect(uri);

  console.log('✅ MongoDB connected');

  mongoose.connection.on('disconnected', () => {
    console.log('⚠️  MongoDB disconnected');
  });
}

module.exports = connectDB;
