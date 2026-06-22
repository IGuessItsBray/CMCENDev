# Use an official Node runtime
FROM node:20-slim

# Set the working directory to the server folder
WORKDIR /usr/src/app/server

# Copy package files from the server directory
COPY server/package*.json ./

# Install dependencies
RUN npm install

# Copy the .env file explicitly
COPY server/.env .

# Copy the rest of the server code
COPY server/ .

# Expose the port (adjust if your server.js uses a different one)
EXPOSE 3000

# Run the server from within the server directory
CMD ["node", "server.js"]