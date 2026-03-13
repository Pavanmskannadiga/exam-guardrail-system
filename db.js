const mongoose = require('mongoose');

async function connectDB() {
  let uri = process.env.MONGO_URI;

  if (!uri) {
    // Local development: use in-memory MongoDB (requires devDependency)
    try {
      const { MongoMemoryServer } = require('mongodb-memory-server');
      console.log('⏳ Starting embedded MongoDB (no local install needed)…');
      const mongod = await MongoMemoryServer.create();
      uri = mongod.getUri();
      console.log('✅ Embedded MongoDB started');
    } catch {
      console.error('❌ No MONGO_URI set and mongodb-memory-server not installed.');
      console.error('   Set the MONGO_URI environment variable to your MongoDB Atlas connection string.');
      process.exit(1);
    }
  }

  await mongoose.connect(uri);
  console.log('✅ MongoDB connected');

  mongoose.connection.on('disconnected', () => {
    console.log('⚠️  MongoDB disconnected');
  });
}

module.exports = connectDB;
