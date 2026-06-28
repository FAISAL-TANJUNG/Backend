import midtransClient from 'midtrans-client';

export const snap = new midtransClient.Snap({
    isProduction: process.env.MIDTRANS_IS_PRODUCTION === 'true',
    serverKey: process.env.MIDTRANS_SERVER_KEY,
    clientKey: 'Mid-client-MP2RNM_wSkiR6TmS'
});