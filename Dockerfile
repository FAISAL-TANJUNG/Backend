FROM node:20-alpine

# 1. Hanya install build tools yang diperlukan untuk compile native module (seperti bcrypt)
RUN apk add --no-cache \
    make \
    gcc \
    g++ \
    python3

WORKDIR /usr/src/app

# 2. Salin package.json dan package-lock.json ke dalam container
COPY package*.json ./

# 3. Install semua dependency Node.js bawaan package.json
RUN npm install

# 4. TRIK PAKSA: Langsung install pdfkit-table di dalam image untuk bypass cache volume
RUN npm install pdfkit-table pdfkit

# 5. Salin seluruh sisa kodingan proyek backend-kos
COPY . .

EXPOSE 3000

# 6. Jalankan aplikasi dalam mode development
CMD ["npm", "run", "dev"]