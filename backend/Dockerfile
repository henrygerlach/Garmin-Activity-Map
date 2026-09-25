FROM node:22-alpine
WORKDIR /app
# tsx is a devDependency but is also what `npm start` runs, so install all.
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
EXPOSE 8788
CMD ["npm", "start"]
