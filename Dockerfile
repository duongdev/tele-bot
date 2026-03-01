FROM node:22

# Set the working directory
WORKDIR /app
# Copy package.json and package-lock.json
COPY package*.json ./
# Install dependencies
RUN npm install
# Create downloads directory
RUN mkdir -p downloads

# Copy the rest of the application code
COPY . .
# Start the application
CMD ["npm", "start"]
