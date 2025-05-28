# Node.js 22
FROM node:22-slim
# Set the working directory
WORKDIR /app
# Copy package.json and package-lock.json
COPY package*.json ./
# Install dependencies
RUN npm install

# Copy the rest of the application code
COPY . .
# Start the application
CMD ["npm", "start"]