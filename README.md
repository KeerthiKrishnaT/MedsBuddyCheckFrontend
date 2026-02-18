# MediCare Companion - Medication Management App

A comprehensive medication management application built with React and Firebase, designed to help patients and caretakers track medication adherence.

## Features

- 🔐 **User Authentication** - Secure login/signup with Firebase Auth
- 💊 **Medication Management** - Add, view, and manage medications with time slots
- 📅 **Medication Tracking** - Mark medications as taken with proof photos
- 🔔 **Reminders & Notifications** - Automated reminders for missed medications
- 📊 **Adherence Dashboard** - Track medication adherence with calendar view
- 👥 **Dual View** - Separate views for patients and caretakers
- 📸 **Proof Photos** - Upload and view proof photos for medication intake
- 📈 **Statistics** - View adherence rates and streaks

## Tech Stack

- **Frontend**: React 18, Vite, React Router, React Icons, React Toastify
- **Backend**: Firebase (Auth, Firestore, Storage, Cloud Functions)
- **Styling**: CSS3 with component-specific stylesheets

## Prerequisites

- Node.js (v16 or higher)
- npm or yarn
- Firebase account
- Git

## Installation

### 1. Clone the repository

```bash
git clone <your-repo-url>
cd Medical
```

### 2. Install dependencies

```bash
# Install client dependencies
cd client
npm install

# Install Firebase Functions dependencies (if needed)
cd ../firebase/functions
npm install
```

### 3. Environment Setup

Create a `.env` file in the `client` directory:

```env
VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_auth_domain
VITE_FIREBASE_PROJECT_ID=meds-buddy-check
VITE_FIREBASE_STORAGE_BUCKET=your_storage_bucket
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id
```

### 4. Firebase Setup

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Create a new project or use existing project
3. Enable Authentication (Email/Password)
4. Create Firestore Database
5. Enable Storage (for proof photos)
6. Deploy Firestore rules and indexes:

```bash
cd firebase
firebase deploy --only firestore
```

### 5. Run the Application

```bash
cd client
npm run dev
```

The app will be available at `http://localhost:3000`

## Deployment

### Deploy to Vercel

1. Push your code to GitHub
2. Go to [Vercel](https://vercel.com/)
3. Import your GitHub repository
4. Set build command: `cd client && npm run build`
5. Set output directory: `client/dist`
6. Add environment variables in Vercel dashboard
7. Deploy!

### Deploy to Netlify

1. Push your code to GitHub
2. Go to [Netlify](https://www.netlify.com/)
3. Import your GitHub repository
4. Set build command: `cd client && npm run build`
5. Set publish directory: `client/dist`
6. Add environment variables in Netlify dashboard
7. Deploy!

## Project Structure

```
Medical/
├── client/                 # React frontend application
│   ├── src/
│   │   ├── components/    # React components
│   │   ├── services/      # Firebase services
│   │   ├── context/       # React context providers
│   │   └── config/        # Firebase configuration
│   └── package.json
├── firebase/              # Firebase configuration
│   ├── functions/         # Cloud Functions
│   ├── firestore.rules    # Firestore security rules
│   ├── firestore.indexes.json
│   └── storage.rules      # Storage security rules
└── README.md
```

## Environment Variables

Make sure to set these environment variables in your deployment platform:

- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`

## License

MIT
