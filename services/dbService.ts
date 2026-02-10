
import { AIResponse, Question } from "../types";
import { db, auth } from "./firebase";
import { 
  doc, 
  getDoc, 
  setDoc, 
  collection, 
  getDocs, 
  query, 
  where, 
  deleteDoc 
} from 'firebase/firestore';

/**
 * MANDATORY ACTION: 
 * Go to Firebase Console > Firestore > Rules and paste this:
 * 
 * service cloud.firestore {
 *   match /databases/{database}/documents {
 *     match /ai_answers/{questionId} {
 *       allow read, write: if request.auth != null;
 *     }
 *     match /user_questions/{questionId} {
 *       allow read, delete: if request.auth != null && resource.data.userId == request.auth.uid;
 *       allow create, update: if request.auth != null && request.resource.data.userId == request.auth.uid;
 *     }
 *   }
 * }
 */

const ANSWERS_COLLECTION = 'ai_answers';
const QUESTIONS_COLLECTION = 'user_questions';

export interface CachedEntry extends AIResponse {
  questionId: string;
  audioBase64?: string;
  timestamp: number;
}

/**
 * Helper to ensure user is logged in before calling Firestore.
 * This prevents "Missing or insufficient permissions" caused by null auth.
 */
const getValidUser = () => {
  const user = auth.currentUser;
  if (!user) {
    console.warn("Operation skipped: No authenticated user found.");
    return null;
  }
  return user;
};

export const getCachedAnswer = async (questionId: string): Promise<CachedEntry | null> => {
  if (!getValidUser()) return null;
  
  try {
    const docRef = doc(db, ANSWERS_COLLECTION, questionId);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      return docSnap.data() as CachedEntry;
    }
    return null;
  } catch (error: any) {
    console.error(`[Firestore Error] getCachedAnswer(${questionId}):`, error.message);
    return null;
  }
};

export const saveAnswerToCache = async (entry: CachedEntry): Promise<void> => {
  if (!getValidUser()) return;

  try {
    const docRef = doc(db, ANSWERS_COLLECTION, entry.questionId);
    await setDoc(docRef, entry);
  } catch (error: any) {
    console.error("[Firestore Error] saveAnswerToCache:", error.message);
  }
};

export const getAllCachedIds = async (): Promise<string[]> => {
  if (!getValidUser()) return [];

  try {
    const querySnapshot = await getDocs(collection(db, ANSWERS_COLLECTION));
    return querySnapshot.docs.map(doc => doc.id);
  } catch (error: any) {
    console.error("[Firestore Error] getAllCachedIds:", error.message);
    return [];
  }
};

export const getCustomQuestions = async (): Promise<Question[]> => {
  const user = getValidUser();
  if (!user) return [];

  try {
    const q = query(
      collection(db, QUESTIONS_COLLECTION), 
      where("userId", "==", user.uid)
    );
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    } as Question));
  } catch (error: any) {
    console.error("[Firestore Error] getCustomQuestions:", error.message);
    return [];
  }
};

export const saveCustomQuestion = async (q: Question): Promise<void> => {
  const user = getValidUser();
  if (!user) return;

  try {
    const docRef = doc(db, QUESTIONS_COLLECTION, q.id);
    await setDoc(docRef, {
      ...q,
      userId: user.uid,
      createdAt: Date.now()
    });
  } catch (error: any) {
    console.error("[Firestore Error] saveCustomQuestion:", error.message);
  }
};

export const deleteCustomQuestion = async (id: string): Promise<void> => {
  if (!getValidUser()) return;

  try {
    await deleteDoc(doc(db, QUESTIONS_COLLECTION, id));
  } catch (error: any) {
    console.error("[Firestore Error] deleteCustomQuestion:", error.message);
  }
};
