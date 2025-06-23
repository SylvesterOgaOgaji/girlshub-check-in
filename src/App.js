import React, { useState, useEffect, useCallback } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, setDoc, updateDoc, onSnapshot, collection, Timestamp, getDoc } from 'firebase/firestore';
// import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage'; // For file uploads (conceptual)

// Global variables provided by the Canvas environment
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? initialAuthToken : null;

// Initialize Firebase app outside of the component to avoid re-initialization
let app;
let db;
let auth;
// let storage; // For Firebase Storage (conceptual)

try {
  app = initializeApp(firebaseConfig);
  db = getFirestore(app);
  auth = getAuth(app);
  // storage = getStorage(app); // Initialize Firebase Storage (conceptual)

  // Enable offline persistence for Firestore.
  // This ensures that reads/writes are cached locally and synced when online.
  // This needs to be called *before* any Firestore operations and only once.
  // Uncomment this for actual deployment with offline capabilities.
  /*
  import { enableIndexedDbPersistence => from 'firebase/firestore';
  enableIndexedDbPersistence(db)
    .then(() => {
      console.log("Firestore offline persistence enabled.");
    })
    .catch((err) => {
      if (err.code === 'failed-precondition') {
        console.warn("Offline persistence not available for multiple tabs (another tab already has it enabled).");
      } else if (err.code === 'unimplemented') {
        console.warn("The current browser does not support offline persistence.");
      } else {
        console.error("Error enabling offline persistence:", err);
      }
    });
  */
} catch (error) {
  console.error("Firebase initialization error: Make sure __firebase_config is correctly provided. This might affect offline capabilities if Firestore isn't initialized.", error);
}

const App = () => {
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [activeFilter, setActiveFilter] = useState('all');
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [currentActivityToUpload, setCurrentActivityToUpload] = useState(null);
  const [uploadMessage, setUploadMessage] = useState('');
  const [showMessageModal, setShowMessageModal] = useState(false); // New state for custom message modal
  const [messageModalContent, setMessageModalContent] = useState({ title: '', body: '', type: 'info' }); // Content for the message modal

  // Function to show a custom message modal
  const showCustomMessage = useCallback((title, body, type = 'info') => {
    setMessageModalContent({ title, body, type });
    setShowMessageModal(true);
  }, []);

  // Define the base activities
  const baseActivities = [
    {
      id: '1',
      name: 'Reading monthly book',
      frequency: 'daily',
      details: 'Read 3 pages daily. Submit 7pm - 7:30pm WAT (explain to Aunty Etima if missed)',
      type: 'read',
      hasStreak: true,
      uploadWindow: {
        startHour: 19, // 7 PM WAT
        startMinute: 0,
        endHour: 19,   // 7:30 PM WAT
        endMinute: 30,
        timezoneOffset: 1 // WAT is UTC+1 (Nigeria time)
      }
    },
    {
      id: '2',
      name: 'Writing in daily journal',
      frequency: 'daily',
      details: 'Submit: 8pm to 8:15pm WAT',
      type: 'write',
      hasStreak: true,
      uploadWindow: {
        startHour: 20, // 8 PM WAT
        startMinute: 0,
        endHour: 20,   // 8:15 PM WAT
        endMinute: 15,
        timezoneOffset: 1 // WAT is UTC+1 (Nigeria time)
      }
    },
    { id: '3', name: 'Daily devotional', frequency: 'daily', details: 'daily', type: 'read', hasStreak: true },
    {
      id: '4',
      name: 'Listening to nightly video notes',
      frequency: 'daily',
      details: 'nightly (Submit: From 7pm WAT)',
      type: 'watch',
      hasStreak: true,
      uploadWindow: {
        startHour: 19, // 7 PM WAT
        startMinute: 0,
        endHour: 23,   // 11 PM WAT (effectively "from 7pm WAT onwards until midnight")
        endMinute: 59,
        timezoneOffset: 1 // WAT is UTC+1 (Nigeria time)
      }
    },
    {
      id: '5',
      name: 'Heart-to-heart Friday talks',
      frequency: 'weekly',
      details: 'Friday, 7pm WAT',
      type: 'link',
      contentUrl: 'https://youtube.com/@etimaumeh?si=oqFjaEdTiU5vZJf1',
      hasStreak: false,
      uploadWindow: {
        dayOfWeek: 5, // Friday (0=Sunday, 1=Monday, ..., 5=Friday, 6=Saturday)
        startHour: 19, // 7 PM WAT
        startMinute: 0,
        endHour: 19,   // 7:30 PM WAT
        endMinute: 30,
        timezoneOffset: 1 // WAT is UTC+1 (Nigeria time)
      }
    },
    {
      id: '6',
      name: 'Weekly magazine',
      frequency: 'weekly',
      details: 'Delivered via WhatsApp every Monday.',
      type: 'read',
      hasStreak: false,
      uploadWindow: {
        dayOfWeek: 1, // Monday (0=Sunday, 1=Monday, ...)
        startHour: 19, // 7 PM WAT
        startMinute: 0,
        endHour: 19, // 7:30 PM WAT
        endMinute: 30,
        timezoneOffset: 1 // WAT is UTC+1 (Nigeria time)
      }
    },
    {
      id: '7',
      name: 'Saturday Home Management Video',
      frequency: 'weekly',
      details: 'Watch on Telegram. 1st and 3rd Saturdays (Upload picture by 12 noon WAT)',
      type: 'watch',
      hasStreak: false,
      watchWindow: {
        dayOfWeek: 6, // Saturday
        startHour: 7, // 7 AM WAT
        startMinute: 30, // 7:30 AM WAT
        endHour: 23, // Effectively ends at midnight for watching
        endMinute: 59,
        timezoneOffset: 1, // WAT is UTC+1
        specificWeeks: [1, 3] // Only 1st and 3rd Saturdays
      },
      uploadWindow: {
        dayOfWeek: 6, // Saturday
        startHour: 0,  // Midnight WAT
        startMinute: 0,
        endHour: 12,   // 12 PM (noon) WAT
        endMinute: 0,
        timezoneOffset: 1, // WAT is UTC+1
        specificWeeks: [1, 3] // Only 1st and 3rd Saturdays
      }
    },
    { id: '8', name: 'Google Classroom Questionnaire', frequency: 'weekly', details: 'via Google Classroom', type: 'link', hasStreak: false },
    {
      id: '9',
      name: 'Weekly Email Review',
      frequency: 'weekly',
      details: 'Delivered via WhatsApp every Monday morning. Submit: Mondays 7am - 12pm WAT',
      type: 'email',
      hasStreak: false,
      contentUrl: 'mailto:info@example.com?subject=Weekly%20Email%20Review', // Example mailto link
      uploadWindow: {
        dayOfWeek: 1, // Monday
        startHour: 7, // 7 AM WAT
        startMinute: 0,
        endHour: 12, // 12 PM (noon) WAT
        endMinute: 0,
        timezoneOffset: 1 // WAT is UTC+1
      }
    },
    {
      id: '10',
      name: 'End-of-Month Review',
      frequency: 'monthly',
      details: '2nd Saturday of the Month (Done on Zoom)',
      type: 'review',
      hasStreak: false,
      watchWindow: { // When the "Start Review" button is active (for joining Zoom)
        dayOfWeek: 6, // Saturday
        specificWeeks: [2], // 2nd Saturday
        startHour: 9, // 9 AM WAT
        startMinute: 0,
        endHour: 10,  // 10 AM WAT
        endMinute: 0,
        timezoneOffset: 1, // WAT is UTC+1
        contentUrl: 'https://zoom.us/join' // Placeholder Zoom link
      },
      uploadWindow: { // When the submission is allowed
        dayOfWeek: 6, // Saturday
        specificWeeks: [2], // 2nd Saturday
        startHour: 0,  // Midnight WAT
        startMinute: 0,
        endHour: 23,   // 11:59 PM WAT
        endMinute: 59,
        timezoneOffset: 1 // WAT is UTC+1
      }
    },
    {
      id: '11',
      name: 'General Mentor Session', // Renamed
      frequency: 'monthly',
      details: 'Last weekend of the month (General Session via Zoom). Google Bookable Appointment Schedule: thegirlshubglobal@gmail.com', // Updated details
      type: 'class',
      hasStreak: false,
      watchWindow: { // When the "Join Class" button is active for the general session
        dayOfWeek: [6, 0], // Saturday (6) and Sunday (0)
        lastOccurrenceOfMonth: true,
        startHour: 9, // 9 AM WAT
        startMinute: 0,
        endHour: 17,  // 5 PM WAT
        endMinute: 0,
        timezoneOffset: 1, // WAT is UTC+1
        contentUrl: 'https://calendar.google.com/calendar/u/0/r?cid=thegirlshubglobal@gmail.com' // Placeholder Google Calendar link
      },
      uploadWindow: { // When the submission is allowed for the general session
        dayOfWeek: [6, 0], // Saturday (6) and Sunday (0)
        lastOccurrenceOfMonth: true,
        startHour: 0,  // Midnight WAT
        startMinute: 0,
        endHour: 23,   // 11:59 PM WAT
        endMinute: 59,
        timezoneOffset: 1 // WAT is UTC+1
      }
    },
    {
      id: '12', // New activity ID
      name: 'Book Individual Mentoring Session',
      frequency: 'on-demand',
      details: 'Book a private session with a psychologist via Google Calendar appointment.',
      type: 'book_appointment', // New custom type
      hasStreak: false,
      contentUrl: 'https://calendar.app.google/pLmkCM8USay6XbEe7', // Updated Google Bookable link
      // No watchWindow or uploadWindow as it's on-demand booking, no submission
    },
  ];

  /**
   * Determines if an activity is completed for the current period (daily, weekly, monthly).
   * @param {object} activity - The activity object.
   * @param {object} lastCompletion - Firestore Timestamp object for the last completion.
   * @returns {boolean} True if completed for the current period, false otherwise.
   */
  const isCompletedForCurrentPeriod = useCallback((activity, lastCompletion) => {
    if (!lastCompletion) return false;

    const lastCompletedDate = lastCompletion.toDate();
    const now = new Date();

    switch (activity.frequency) {
      case 'daily':
        return (
          lastCompletedDate.getDate() === now.getDate() &&
          lastCompletedDate.getMonth() === now.getMonth() &&
          lastCompletedDate.getFullYear() === now.getFullYear()
        );
      case 'weekly':
        const dayOfWeekLast = lastCompletedDate.getDay();
        const dayOfWeekNow = now.getDay();
        const startOfLastCompletedWeek = new Date(lastCompletedDate);
        startOfLastCompletedWeek.setDate(lastCompletedDate.getDate() - dayOfWeekLast);
        startOfLastCompletedWeek.setHours(0, 0, 0, 0);

        const startOfCurrentWeek = new Date(now);
        startOfCurrentWeek.setDate(now.getDate() - dayOfWeekNow);
        startOfCurrentWeek.setHours(0, 0, 0, 0);

        return startOfLastCompletedWeek.getTime() === startOfCurrentWeek.getTime();
      case 'monthly':
        return (
          lastCompletedDate.getMonth() === now.getMonth() &&
          lastCompletedDate.getFullYear() === now.getFullYear()
        );
      default: // For one-time or custom tasks, assume completed if lastCompletion exists
        return true;
    }
  }, []);

  // Firebase Authentication Effect
  useEffect(() => {
    if (!auth) {
      console.error("Firebase Auth not initialized.");
      setLoading(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setUserId(user.uid);
      } else {
        try {
          if (initialAuthToken) {
            await signInWithCustomToken(auth, initialAuthToken);
          } else {
            await signInAnonymously(auth);
          }
          setUserId(auth.currentUser?.uid || crypto.randomUUID());
        } catch (error) {
          console.error("Firebase authentication failed:", error);
          setUserId(crypto.randomUUID()); // Fallback for offline usage, though real auth is critical
        }
      }
      setIsAuthReady(true);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  /**
   * Core function to update activity completion and streak in Firestore.
   * This is called by the modal after a successful conceptual upload.
   */
  const toggleActivityCompletion = useCallback(async (activityId, currentCompleted, activityDetails) => {
    if (!userId || !db) {
      console.error("Firestore or User ID not available for update.");
      return;
    }

    const activityRef = doc(db, `artifacts/${appId}/users/${userId}/activities`, activityId);
    const now = Timestamp.now();

    let newStreakCount = 0;
    let newLastCompleted = null;
    let newCompletedStatus = false;

    if (!currentCompleted) { // Marking as complete
      newCompletedStatus = true;
      newLastCompleted = now;

      if (activityDetails.hasStreak) {
        try {
          const activityDocSnapshot = await getDoc(activityRef);
          const currentFirestoreData = activityDocSnapshot.exists() ? activityDocSnapshot.data() : {};
          const oldLastCompletedTimestamp = currentFirestoreData.lastCompleted;
          const oldStreakCount = currentFirestoreData.streakCount || 0;

          if (oldLastCompletedTimestamp) {
            const oldLastCompletedDate = oldLastCompletedTimestamp.toDate();
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            oldLastCompletedDate.setHours(0, 0, 0, 0);

            let isConsecutive = false;
            if (activityDetails.frequency === 'daily') {
              const yesterday = new Date(today);
              yesterday.setDate(today.getDate() - 1);
              if (oldLastCompletedDate.getTime() === yesterday.getTime()) {
                isConsecutive = true;
              }
            }

            if (isConsecutive) {
              newStreakCount = oldStreakCount + 1;
            } else {
              newStreakCount = 1;
            }
          } else {
            newStreakCount = 1;
          }
        } catch (e) {
          console.error("Error fetching activity for streak calculation:", e);
          newStreakCount = 1;
        }
      }
    } else { // Marking as incomplete
      newCompletedStatus = false;
      newLastCompleted = null;
      newStreakCount = 0;
    }

    try {
      await setDoc(activityRef, {
        completed: newCompletedStatus,
        lastCompleted: newLastCompleted,
        streakCount: newStreakCount
      }, { merge: true });
      console.log(`Activity ${activityId} completion updated to ${newCompletedStatus}`);
    } catch (e) {
      console.error("Error updating activity completion or streak:", e);
      setUploadMessage('Failed to update activity. Please try again.');
    }
  }, [userId, db]);

  // Helper to determine if a date is the last occurrence of a specific day of week in its month
  const isLastOccurrenceOfMonth = useCallback((date, dayOfWeek) => {
    const currentMonth = date.getUTCMonth();
    const currentYear = date.getUTCFullYear();

    // Get the last day of the current month
    const lastDayCurrentMonth = new Date(Date.UTC(currentYear, currentMonth + 1, 0)); // Day 0 of next month is last day of current month

    // Find the last occurrence of 'dayOfWeek' in the current month
    let lastTargetDayDate = lastDayCurrentMonth.getUTCDate();
    let tempDate = new Date(Date.UTC(currentYear, currentMonth, lastTargetDayDate));

    while (tempDate.getUTCDay() !== dayOfWeek && lastTargetDayDate > 0) {
      lastTargetDayDate--;
      tempDate.setUTCDate(lastTargetDayDate);
    }
    return date.getUTCDate() === lastTargetDayDate;
  }, []);


  /**
   * Helper function to check if current time is within a given window.
   * @param {object} windowConfig - Object with dayOfWeek, startHour, startMinute, endHour, endMinute, specificWeeks, timezoneOffset, lastOccurrenceOfMonth.
   * @returns {boolean} True if within window, false otherwise.
   */
  const checkTimeWindow = useCallback((windowConfig) => {
    if (!windowConfig) return true; // No window specified, always allowed

    const now = new Date();
    const currentDayOfWeek = now.getUTCDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
    const currentHourWAT = now.getUTCHours() + windowConfig.timezoneOffset;
    const currentMinuteWAT = now.getUTCMinutes();

    const { dayOfWeek, startHour, startMinute, endHour, endMinute, specificWeeks, lastOccurrenceOfMonth: isLastOccurrence } = windowConfig;

    let timeCheck =
      (currentHourWAT > startHour || (currentHourWAT === startHour && currentMinuteWAT >= startMinute)) &&
      (currentHourWAT < endHour || (currentHourWAT === endHour && currentMinuteWAT <= endMinute));

    let dayCheck = true;
    if (dayOfWeek !== undefined) {
      if (Array.isArray(dayOfWeek)) {
        dayCheck = dayOfWeek.includes(currentDayOfWeek);
      } else {
        dayCheck = currentDayOfWeek === dayOfWeek;
      }
    }

    let weekCheck = true;
    if (specificWeeks && specificWeeks.length > 0) {
      const dayOfMonth = now.getUTCDate();
      const firstDayOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
      const firstDayOfMonthDayOfWeek = firstDayOfMonth.getUTCDay();

      let firstOccurrenceOfDay;
      if (dayOfWeek !== undefined) {
        if (Array.isArray(dayOfWeek)) { // If dayOfWeek is an array, take the first one for this calculation
          const firstTargetDay = dayOfWeek[0]; // Assuming for week calculation, we just need one day if multiple
          if (firstDayOfMonthDayOfWeek <= firstTargetDay) {
            firstOccurrenceOfDay = 1 + (firstTargetDay - firstDayOfMonthDayOfWeek);
          } else {
            firstOccurrenceOfDay = 1 + (7 - firstDayOfMonthDayOfWeek + firstTargetDay);
          }
        } else { // Single dayOfWeek
          if (firstDayOfMonthDayOfWeek <= dayOfWeek) {
            firstOccurrenceOfDay = 1 + (dayOfWeek - firstDayOfMonthDayOfWeek);
          } else {
            firstOccurrenceOfDay = 1 + (7 - firstDayOfMonthDayOfWeek + dayOfWeek);
          }
        }
      } else {
        firstOccurrenceOfDay = 1; // Fallback if dayOfWeek is not specified with specificWeeks
      }

      const currentOccurrence = Math.ceil((dayOfMonth - firstOccurrenceOfDay + 1) / 7);
      weekCheck = specificWeeks.includes(currentOccurrence);
    } else if (isLastOccurrence && dayOfWeek !== undefined) {
        // If lastOccurrenceOfMonth is true, override specificWeeks and directly check for last occurrence
        if (Array.isArray(dayOfWeek)) {
          weekCheck = dayOfWeek.some(d => isLastOccurrenceOfMonth(now, d));
        } else {
          weekCheck = isLastOccurrenceOfMonth(now, dayOfWeek);
        }
    }


    return timeCheck && dayCheck && weekCheck;
  }, [isLastOccurrenceOfMonth]);

  /**
   * Formats a time range for display in messages.
   * @param {object} windowConfig - The window configuration object.
   * @returns {string} Formatted time range string.
   */
  const formatTimeRangeForMessage = useCallback((windowConfig) => {
    if (!windowConfig) return '';
    const { dayOfWeek, startHour, startMinute, endHour, endMinute, specificWeeks, lastOccurrenceOfMonth: isLastOccurrence } = windowConfig;

    const formatTime = (hour, minute) => {
      const displayHour = hour > 12 ? hour - 12 : (hour === 0 ? 12 : hour);
      const ampm = hour >= 12 ? 'pm' : 'am';
      return `${displayHour}:` + String(minute).padStart(2, '0') + ampm;
    };

    const startTimeFormatted = formatTime(startHour, startMinute);
    const endTimeFormatted = formatTime(endHour, endMinute);
    const dayNames = dayOfWeek ? (Array.isArray(dayOfWeek) ? dayOfWeek.map(d => ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][d]).join(' or ') : ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][dayOfWeek]) : '';
    const weekText = specificWeeks && specificWeeks.length > 0
      ? `(the ${specificWeeks.map(w => w + (w === 1 ? 'st' : w === 2 ? 'nd' : w === 3 ? 'rd' : 'th')).join(' and ')} ${dayNames} of the month)`
      : '';
    const lastOccurrenceText = isLastOccurrence && dayNames
        ? `(the last ${dayNames} of the month)`
        : '';

    let timePhrase;
    if (endHour === 23 && endMinute === 59 && startHour < 23) {
      timePhrase = `from ${startTimeFormatted} WAT onwards`;
    } else {
      timePhrase = `between ${startTimeFormatted} - ${endTimeFormatted} WAT`;
    }

    return `${dayNames ? 'on ' + dayNames : ''}${weekText ? ' ' + weekText : ''}${lastOccurrenceText ? ' ' + lastOccurrenceText : ''} ${timePhrase}`;
  }, []);

  /**
   * Handles the completion toggle for an activity, including streak calculation and showing upload modal.
   * Also checks upload window for specific activities.
   * @param {string} activityId - The ID of the activity.
   * @param {boolean} currentCompleted - Current completion status.
   * @param {object} activityDetails - Full activity object.
   */
  const handleToggleCompletion = useCallback((activityId, currentCompleted, activityDetails) => {
    // If marking as complete, show the upload modal first
    if (!currentCompleted) {
      // Check for upload window before showing modal
      if (activityDetails.uploadWindow && !checkTimeWindow(activityDetails.uploadWindow)) {
        const uploadTimeDisplay = formatTimeRangeForMessage(activityDetails.uploadWindow);
        showCustomMessage(
          "Submission Not Allowed",
          `Submission for "${activityDetails.name}" is only allowed ${uploadTimeDisplay}.`,
          'error'
        );
        return; // Prevent showing modal if outside window
      }

      setCurrentActivityToUpload(activityDetails);
      setShowUploadModal(true);
      setUploadMessage('');
    } else {
      // If marking as incomplete, directly update Firestore (no upload needed)
      toggleActivityCompletion(activityId, currentCompleted, activityDetails);
    }
  }, [toggleActivityCompletion, checkTimeWindow, showCustomMessage, formatTimeRangeForMessage]);

  // Firestore Data Fetching and Real-time Listener Effect
  useEffect(() => {
    if (!isAuthReady || !userId || !db) {
      return;
    }

    const userActivitiesCollectionRef = collection(db, `artifacts/${appId}/users/${userId}/activities`);
    // Public data should be stored in /artifacts/${appId}/public/data/{your_collection_name}
    const customTasksCollectionRef = collection(db, `artifacts/${appId}/public/data/customTasks`);

    // Listen for user-specific activities
    const unsubscribeActivities = onSnapshot(userActivitiesCollectionRef, (snapshot) => {
      const userActivityData = {};
      snapshot.forEach((doc) => {
        userActivityData[doc.id] = doc.data();
      });

      // Listen for custom tasks (e.g., global, age-group specific)
      // This part would need more complex queries for filtering by age group/mentee ID in a real app
      // For now, it's a conceptual placeholder for how admin-added tasks would be fetched.
      onSnapshot(customTasksCollectionRef, (customTasksSnapshot) => {
          const customTasks = [];
          customTasksSnapshot.forEach(doc => {
            const taskData = doc.data();
            // Basic filtering for demonstration: assume 'everyone' or specific mentee ID
            // In a real app, you'd check taskData.assignedTo (e.g., 'everyone', 'pre-tweens', or specific userId)
            if (taskData.assignedTo === 'everyone' || taskData.assignedTo === userId) {
              customTasks.push({ id: doc.id, ...taskData, isCustom: true });
            }
          });

          // Combine base activities with custom tasks
          const allActivities = [...baseActivities, ...customTasks];

          const updatedActivities = allActivities.map(activity => {
            const storedActivity = userActivityData[activity.id];
            let completed = false;
            let lastCompleted = null;
            let streakCount = 0;

            if (storedActivity) {
              lastCompleted = storedActivity.lastCompleted;
              completed = isCompletedForCurrentPeriod(activity, lastCompleted);
              streakCount = storedActivity.streakCount || 0;

              // Streak reset logic on missed daily completion
              if (activity.hasStreak && lastCompleted) {
                 const lastCompletedDate = lastCompleted.toDate();
                 const now = new Date();
                 let isGap = false;

                 if (activity.frequency === 'daily') {
                     const yesterday = new Date(now);
                     yesterday.setDate(now.getDate() - 1);
                     yesterday.setHours(0,0,0,0);
                     lastCompletedDate.setHours(0,0,0,0);

                     if (lastCompletedDate.getTime() !== yesterday.getTime() && !isCompletedForCurrentPeriod(activity, lastCompleted)) {
                         isGap = true;
                     }
                 }
                 if (isGap && !completed) {
                     streakCount = 0;
                 }
              }
            }
            return { ...activity, completed, lastCompleted, streakCount };
          });

          setActivities(updatedActivities);
          setLoading(false);
      }, (error) => console.error("Error fetching custom tasks:", error)); // Handle custom task fetch error

    }, (error) => {
      console.error("Error fetching activities from Firestore:", error);
      setLoading(false);
    });

    return () => unsubscribeActivities(); // Clean up main activities listener
  }, [isAuthReady, userId, db, isCompletedForCurrentPeriod]);


  // Conceptual file upload handler
  const handleFileUpload = async (file) => {
    if (!currentActivityToUpload || !userId) return;

    setUploadMessage('Uploading...');
    try {
      // In a real app, this is where Firebase Storage upload logic would go.
      // For offline:
      // 1. Save file to IndexedDB (local browser storage) or React Native's file system.
      // 2. Add an entry to an "upload queue" in IndexedDB/SQLite.
      // 3. Background sync process would pick this up when online and upload to Firebase Storage.
      //    (e.g., using a Service Worker for PWA, or a background task for native apps)

      // Example placeholder for a successful upload:
      await new Promise(resolve => setTimeout(resolve, 1500)); // Simulate network delay
      const mockFileUrl = `https://placehold.co/150x100?text=Summary_${currentActivityToUpload.id}`;
      console.log(`Simulated upload of ${file.name} for ${currentActivityToUpload.name}. URL: ${mockFileUrl}`);

      // After successful (simulated) upload, update Firestore for activity completion
      await toggleActivityCompletion(currentActivityToUpload.id, false, currentActivityToUpload);
      setUploadMessage('Upload successful and activity marked complete! 🎉');
      setTimeout(() => setShowUploadModal(false), 1000); // Close modal after success
    } catch (error) {
      console.error("File upload failed:", error);
      setUploadMessage('Upload failed. Please retry.');
    }
  };

  const filteredActivities = activities.filter(activity => {
    if (activeFilter === 'all') return true;
    return activity.frequency === activeFilter;
  });

  const getActionButtonText = (type) => {
    switch (type) {
      case 'read': return 'Read Now';
      case 'watch': return 'Watch Video';
      case 'write': return 'Start Journal';
      case 'join': return 'Join Talk';
      case 'review': return 'Start Review';
      case 'class': return 'Join Class';
      case 'link': return 'Go to Link';
      case 'email': return 'Read Email';
      case 'book_appointment': return 'Book Session'; // New button text for booking
      case 'text': return 'View Instructions';
      case 'pdf': return 'View PDF';
      case 'audio': return 'Listen Now';
      default: return 'View';
    }
  };

  const getStreakEmoji = (streak) => {
    if (streak >= 7) return '🌟';
    if (streak > 0) return '✅'; // Reduced emoji variation for simplicity, can be expanded
    return '';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-purple-50 to-pink-50 dark:from-gray-900 dark:to-gray-800 text-purple-700 dark:text-pink-300">
        <p className="text-xl font-semibold animate-pulse">Loading GirlsHub Abuja Check-in...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-pink-50 to-green-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-700 font-inter text-gray-800 dark:text-gray-200 p-4 sm:p-6 md:p-8">
      <div className="max-w-4xl mx-auto bg-white dark:bg-gray-800 rounded-3xl shadow-2xl overflow-hidden">
        {/* Header Section */}
        <div className="p-6 sm:p-8 border-b border-purple-100 dark:border-gray-700 bg-purple-600 dark:bg-purple-900 text-white rounded-t-3xl">
          <div className="flex items-center mb-4">
            {/* Company Logo */}
            <img
              src="gh logo.jpg" // Path to the uploaded logo
              alt="GirlsHub Logo"
              className="h-10 sm:h-12 w-auto rounded-md shadow-md mr-4"
              onError={(e) => { e.target.onerror = null; e.target.src="https://placehold.co/120x40/5D3FD3/FFFFFF?text=GIRLSHUB"; }}
            />
            <h1 className="text-3xl sm:text-4xl font-extrabold text-white mb-0">
              GirlsHub Abuja Check-in
            </h1>
          </div>
          <p className="text-purple-100 dark:text-purple-200 text-sm sm:text-base">
            Empowering girls, one activity at a time!
          </p>
          {userId && (
            <p className="text-xs text-purple-200 dark:text-purple-300 mt-2 break-all">
              Your Member ID: <span className="font-mono">{userId}</span>
            </p>
          )}
        </div>

        {/* Filter Buttons */}
        <div className="p-4 sm:p-6 md:p-8 bg-purple-50 dark:bg-gray-800 border-b border-purple-100 dark:border-gray-700">
          <div className="flex justify-center flex-wrap gap-2 sm:gap-3">
            {['all', 'daily', 'weekly', 'monthly', 'on-demand'].map(filter => (
              <button
                key={filter}
                onClick={() => setActiveFilter(filter)}
                className={`px-4 py-2 rounded-full text-sm font-semibold transition duration-300 ease-in-out shadow-md
                  ${activeFilter === filter
                    ? 'bg-pink-500 text-white hover:bg-pink-600 transform scale-105'
                    : 'bg-white text-purple-700 hover:bg-pink-100 dark:bg-gray-700 dark:text-pink-300 dark:hover:bg-gray-600'
                  }`}
              >
                {filter.charAt(0).toUpperCase() + filter.slice(1)} Activities
              </button>
            ))}
          </div>
        </div>

        {/* Today's Tasks Section (Conceptual) */}
        <div className="p-4 sm:p-6 md:p-8 bg-white dark:bg-gray-800">
          <h2 className="text-2xl sm:text-3xl font-bold text-purple-700 dark:text-purple-400 mb-4">Today's Tasks</h2>
          {/* In a full app, this would show only daily tasks or overdue tasks */}
          {filteredActivities.filter(a => a.frequency === 'daily').length > 0 ? (
            <div className="space-y-4">
              {filteredActivities.filter(a => a.frequency === 'daily').map((activity) => (
                <ActivityCard
                  key={activity.id}
                  activity={activity}
                  onToggleCompletion={handleToggleCompletion}
                  getActionButtonText={getActionButtonText}
                  getStreakEmoji={getStreakEmoji}
                  checkTimeWindow={checkTimeWindow} // Pass checkTimeWindow for action button
                  showCustomMessage={showCustomMessage} // Pass showCustomMessage
                  formatTimeRangeForMessage={formatTimeRangeForMessage} // Pass formatter
                />
              ))}
            </div>
          ) : (
            <p className="text-center text-gray-500 dark:text-gray-400 py-4">No daily tasks for today! 🎉</p>
          )}
          <h2 className="text-2xl sm:text-3xl font-bold text-purple-700 dark:text-purple-400 mt-8 mb-4">All Activities</h2>
          <div className="space-y-4">
            {filteredActivities.length === 0 ? (
              <p className="text-center text-gray-500 dark:text-gray-400 py-8">No activities found for this filter.</p>
            ) : (
              filteredActivities.map((activity) => (
                <ActivityCard
                  key={activity.id}
                  activity={activity}
                  onToggleCompletion={handleToggleCompletion}
                  getActionButtonText={getActionButtonText}
                  getStreakEmoji={getStreakEmoji}
                  checkTimeWindow={checkTimeWindow} // Pass checkTimeWindow for action button
                  showCustomMessage={showCustomMessage} // Pass showCustomMessage
                  formatTimeRangeForMessage={formatTimeRangeForMessage} // Pass formatter
                />
              ))
            )}
          </div>
        </div>
      </div>

      {/* Upload Summary Modal */}
      {showUploadModal && (
        <UploadSummaryModal
          activity={currentActivityToUpload}
          onClose={() => setShowUploadModal(false)}
          onUpload={handleFileUpload}
          message={uploadMessage}
          // Pass upload window details to modal for display
          uploadWindow={currentActivityToUpload?.uploadWindow}
          checkTimeWindow={checkTimeWindow} // Pass checkTimeWindow to modal
          showCustomMessage={showCustomMessage} // Pass showCustomMessage
          formatTimeRangeForMessage={formatTimeRangeForMessage} // Pass formatter
        />
      )}

      {/* Custom Message Modal */}
      {showMessageModal && (
        <MessageModal
          title={messageModalContent.title}
          body={messageModalContent.body}
          type={messageModalContent.type}
          onClose={() => setShowMessageModal(false)}
        />
      )}
    </div>
  );
};

const ActivityCard = ({ activity, onToggleCompletion, getActionButtonText, getStreakEmoji, checkTimeWindow, showCustomMessage, formatTimeRangeForMessage }) => {
  // Determine if the action button (e.g., Watch Video, Read Now) should be enabled
  // For 'book_appointment' type, the button is always enabled, so no watchWindow check is needed.
  const isActionButtonEnabled = (activity.type === 'book_appointment') ? true : (activity.watchWindow ? checkTimeWindow(activity.watchWindow) : true);

  const handleActionButtonClick = () => {
    // Specific logic for 'book_appointment' type
    if (activity.type === 'book_appointment' && activity.contentUrl) {
      window.open(activity.contentUrl, '_blank'); // Open the booking link
      showCustomMessage(
        "Booking Session",
        `Opening Google Calendar appointment schedule for individual session. Please select an available slot.`,
        'info'
      );
      return; // Do not proceed to other alerts/actions
    }

    // Specific logic for 'email' type
    if (activity.type === 'email' && activity.contentUrl) {
      if (!isActionButtonEnabled) {
          showCustomMessage(
            "Button Not Active",
            `The 'Read Email' button for "${activity.name}" is not active at this time.`,
            'warning'
          );
          return;
      }
      window.open(activity.contentUrl, '_blank'); // Open mailto link or general webmail link
      showCustomMessage(
        "Opening Email",
        `Attempting to open your email client or webmail. Please read the email and then use the checkbox to submit your summary.`,
        'info'
      );
      return; // Do not proceed to the generic alert
    }

    if (!isActionButtonEnabled) {
      const windowConfig = activity.watchWindow || activity.uploadWindow; // Use watchWindow if available, otherwise uploadWindow
      if (windowConfig) {
        const timeConstraintMessage = formatTimeRangeForMessage(windowConfig);
        showCustomMessage(
          "Button Not Active",
          `The "${getActionButtonText(activity.type)}" button for "${activity.name}" is only active ${timeConstraintMessage}.`,
          'warning'
        );
      } else {
         showCustomMessage(
           "Action Triggered",
           `Action for "${activity.name}": ${getActionButtonText(activity.type)}\n\n(This button will lead to content or an input area for the task itself, before you upload the summary.)`,
           'info'
         );
      }
      return;
    }

    // Default action for other types, or if watchWindow is not defined
    if (activity.type === 'link' && activity.contentUrl) {
      window.open(activity.contentUrl, '_blank'); // Open link in new tab
    } else if (activity.type === 'review' && activity.watchWindow && activity.watchWindow.contentUrl) {
      // For 'review' type with a watchWindow contentUrl (e.g., Zoom link)
      window.open(activity.watchWindow.contentUrl, '_blank');
      showCustomMessage(
        "Joining Session",
        `Opening Zoom session for "${activity.name}". Please join the session.`,
        'info'
      );
    } else if (activity.type === 'class' && activity.watchWindow && activity.watchWindow.contentUrl) {
      // For 'class' type with a watchWindow contentUrl (e.g., Google Bookable link)
      window.open(activity.watchWindow.contentUrl, '_blank');
      showCustomMessage(
        "Joining Class",
        `Opening Google Bookable Appointment Schedule for "${activity.name}". Please check available slots.`,
        'info'
      );
    }
    else {
      showCustomMessage(
        "Action Triggered",
        `Action for "${activity.name}": ${getActionButtonText(activity.type)}\n\n(This button will lead to content or an input area for the task itself, before you upload the summary.)`,
        'info'
      );
    }
  };

  return (
    <div
      className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 bg-purple-50 dark:bg-gray-700 rounded-2xl shadow-lg transition-transform duration-300 hover:scale-[1.01]"
    >
      {/* Activity Details */}
      <div className="flex-1 min-w-0 pr-4 mb-3 sm:mb-0">
        <h3 className="text-lg sm:text-xl font-bold text-purple-800 dark:text-purple-300 break-words">
          {activity.name}
          {activity.hasStreak && activity.streakCount > 0 && (
            <span className="ml-2 text-pink-500 text-lg">
              {getStreakEmoji(activity.streakCount)} {activity.streakCount}
            </span>
          )}
        </h3>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          <span className="capitalize font-medium">{activity.frequency}</span> ({activity.details})
        </p>
        <p className={`text-xs font-semibold mt-1 ${activity.completed ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`}>
          Status: {activity.completed ? 'Completed!' : 'Incomplete'}
        </p>
        {activity.type !== 'book_appointment' && ( // Only show "Requires upload" for activities that need it
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Requires: <span className="font-semibold">Photo upload of handwritten summary</span>
          </p>
        )}
        {activity.lastCompleted && (
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Last completed: {activity.lastCompleted.toDate().toLocaleDateString()}
          </p>
        )}
      </div>

      {/* Action Button & Checkbox */}
      <div className="flex items-center gap-4 w-full sm:w-auto">
        {/* Action Button */}
        <button
          onClick={handleActionButtonClick}
          className="px-4 py-2 bg-pink-500 text-white rounded-full text-sm font-semibold shadow-md hover:bg-pink-600 transition-colors duration-300 flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={!isActionButtonEnabled}
        >
          {getActionButtonText(activity.type)}
        </button>

        {/* Completion Checkbox - now triggers modal */}
        {activity.type !== 'book_appointment' && ( // Hide checkbox for booking activity
            <label className="flex items-center cursor-pointer">
              <input
                type="checkbox"
                className="form-checkbox h-6 w-6 text-green-600 rounded-md border-2 border-green-400 focus:ring-2 focus:ring-green-500 dark:bg-gray-600 dark:border-gray-500 dark:checked:bg-green-700 transition-colors duration-200"
                checked={activity.completed}
                onChange={() => onToggleCompletion(activity.id, activity.completed, activity)}
              />
              <span className="ml-2 text-sm text-gray-700 dark:text-gray-300 sr-only">
                Mark as {activity.completed ? 'incomplete' : 'complete'}
              </span>
            </label>
        )}
      </div>
    </div>
  );
};

const UploadSummaryModal = ({ activity, onClose, onUpload, message, uploadWindow, checkTimeWindow, showCustomMessage, formatTimeRangeForMessage }) => {
  const [selectedFile, setSelectedFile] = useState(null);

  const handleFileChange = (event) => {
    if (event.target.files && event.target.files[0]) {
      setSelectedFile(event.target.files[0]);
    } else {
      setSelectedFile(null);
    }
  };

  const handleUploadClick = () => {
    if (selectedFile) {
      onUpload(selectedFile);
    } else {
      showCustomMessage("No File Selected", "Please select a file to upload.", "warning");
    }
  };

  const isUploadAllowed = uploadWindow ? checkTimeWindow(uploadWindow) : true;
  const uploadEnabled = isUploadAllowed && selectedFile;

  const uploadTimeDisplay = formatTimeRangeForMessage(uploadWindow);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl p-6 w-full max-w-md mx-auto relative">
        <button
          onClick={onClose}
          className="absolute top-3 right-3 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 text-xl font-bold"
        >
          &times;
        </button>
        <h2 className="text-xl font-bold text-purple-700 dark:text-purple-400 mb-4">
          Upload Summary for "{activity?.name}"
        </h2>
        <p className="text-gray-700 dark:text-gray-300 mb-4">
          Please upload a photo of your handwritten summary for this activity.
          This will mark the activity as complete.
        </p>

        {uploadWindow && !isUploadAllowed && (
          <p className="text-red-500 dark:text-red-400 mb-4 text-sm font-semibold">
            Submissions for this activity are only accepted {uploadTimeDisplay}.
          </p>
        )}
        {uploadWindow && isUploadAllowed && (
          <p className="text-green-600 dark:text-green-400 mb-4 text-sm font-semibold">
            Submission window is currently open! Submissions are accepted {uploadTimeDisplay}.
          </p>
        )}

        <input
          type="file"
          accept="image/*"
          capture="environment" // Suggests front/rear camera for mobile
          onChange={handleFileChange}
          className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-purple-50 file:text-purple-700 hover:file:bg-purple-100 dark:file:bg-gray-700 dark:file:text-purple-300 dark:hover:file:bg-gray-600"
          disabled={!isUploadAllowed} // Disable input if outside window
        />
        {selectedFile && (
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">Selected: {selectedFile.name}</p>
        )}
        <button
          onClick={handleUploadClick}
          className="mt-6 w-full py-3 bg-pink-500 text-white rounded-lg font-semibold shadow-md hover:bg-pink-600 transition-colors duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={!uploadEnabled} // Disable upload button based on logic
        >
          Upload & Complete
        </button>
        {message && (
          <p className={`mt-3 text-center text-sm ${message.includes('successful') ? 'text-green-600' : 'text-red-500'} dark:text-gray-300`}>
            {message}
          </p>
        )}
      </div>
    </div>
  );
};


// New MessageModal component
const MessageModal = ({ title, body, type, onClose }) => {
  let bgColor = 'bg-blue-500'; // info
  let textColor = 'text-white';
  let icon = 'ℹ️';

  if (type === 'error') {
    bgColor = 'bg-red-500';
    icon = '❌';
  } else if (type === 'warning') {
    bgColor = 'bg-yellow-500';
    textColor = 'text-gray-800'; // Darker text for better contrast on yellow
    icon = '⚠️';
  } else if (type === 'success') {
    bgColor = 'bg-green-500';
    icon = '✅';
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-[999]"> {/* Higher z-index */}
      <div className={`rounded-xl shadow-2xl p-6 w-full max-w-md mx-auto relative ${bgColor} ${textColor}`}>
        <button
          onClick={onClose}
          className="absolute top-3 right-3 text-white hover:text-gray-200 text-xl font-bold"
        >
          &times;
        </button>
        <h2 className="text-xl font-bold mb-3 flex items-center">
          <span className="mr-2">{icon}</span> {title}
        </h2>
        <p className="text-sm">{body}</p>
        <button
          onClick={onClose}
          className="mt-6 w-full py-2 px-4 rounded-lg font-semibold bg-white bg-opacity-20 hover:bg-opacity-30 transition-colors duration-300"
        >
          Got It
        </button>
      </div>
    </div>
  );
};


export default App;

