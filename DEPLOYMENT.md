# 🚀 Deployment Guide - Silver Fleet

## Prerequisites

- Node.js 18+ installed
- npm or yarn package manager
- Google Gemini API Key
- (Optional) Supabase account for real database auditing

## Environment Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure API Key

Create a `.env` file in the root directory:

```env
API_KEY=your_gemini_api_key_here
```

**Get your Gemini API Key:**
- Go to [Google AI Studio](https://aistudio.google.com/app/apikey)
- Create a new API key
- Copy and paste it in your `.env` file

### 3. (Optional) Configure Supabase

If you want to use real database auditing:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your_supabase_anon_key
```

**Get Supabase credentials:**
- Go to your [Supabase Dashboard](https://supabase.com/dashboard)
- Project Settings → API
- Copy the URL and anon/public key

> ⚠️ **Security:** For auditing, it's recommended to create a read-only role in Supabase

## Development

```bash
npm run dev
```

Access the app at `http://localhost:3000`

## Production Build

```bash
npm run build
npm run preview
```

## Deploy to Vercel

### Via Vercel CLI

```bash
npm i -g vercel
vercel
```

### Via Vercel Dashboard

1. Push your code to GitHub
2. Go to [Vercel Dashboard](https://vercel.com/dashboard)
3. Click "New Project"
4. Import your GitHub repository
5. Add environment variables:
   - `API_KEY` = your Gemini API key
   - (Optional) `SUPABASE_URL` and `SUPABASE_ANON_KEY`
6. Deploy!

## Deploy to Netlify

1. Build the project: `npm run build`
2. Drag and drop the `dist` folder to Netlify
3. Or connect your GitHub repo
4. Set environment variables in Netlify dashboard

## Deploy to Your Own Server

### Using Docker (Coming soon)

```bash
docker build -t silverfleet .
docker run -p 3000:3000 -e API_KEY=your_key silverfleet
```

### Using PM2

```bash
npm run build
npm i -g pm2
pm2 start npm --name "silverfleet" -- run preview
```

## Security Checklist

- [ ] Never commit `.env` file to Git
- [ ] Use read-only database credentials for auditing
- [ ] Consider using a staging database instead of production
- [ ] Rotate API keys periodically
- [ ] Enable CORS restrictions on your webhook endpoints
- [ ] Use HTTPS in production

## Troubleshooting

### API Key Not Working

- Make sure the key is valid and active in Google AI Studio
- Check that `.env` file is in the root directory
- Restart the dev server after adding the key

### Supabase Connection Issues

- Verify URL and key are correct
- Check that the anon key has read permissions
- Ensure tables you're monitoring exist in your database
- Check Supabase logs for authentication errors

### Build Errors

```bash
# Clear cache and reinstall
rm -rf node_modules package-lock.json
npm install
npm run build
```

## Performance Optimization

- The app uses Vite for fast builds
- Production builds are optimized automatically
- Consider using a CDN for static assets
- Enable gzip compression on your server

## Monitoring

For production, consider adding:
- Error tracking (Sentry)
- Analytics (Plausible, Umami)
- Uptime monitoring (UptimeRobot)

## Support

For issues or questions:
- Check the documentation in `/docs`
- Review example workflows in `/examples`
- Open an issue on GitHub

---

**Last updated:** October 2025  
**Version:** 2.1.0 - Real Database Auditing


