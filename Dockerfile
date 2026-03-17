FROM node:22

# Install yt-dlp and ffmpeg for YouTube downloads
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg python3 pipx && \
    pipx install yt-dlp && \
    pipx upgrade yt-dlp && \
    ln -s /root/.local/bin/yt-dlp /usr/local/bin/yt-dlp && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

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
