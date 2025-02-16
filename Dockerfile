FROM node:22.14.0-alpine

# Set the working directory
WORKDIR /app

# Copy package.json and package-lock.json before running npm install
COPY package*.json ./

# Install dependencies with a clean, production-focused approach
RUN npm install

# Copy the rest of the application files
COPY . .

# Expose the application port
#EXPOSE 3000

# Define the startup command
CMD ["node", "main.js"]
