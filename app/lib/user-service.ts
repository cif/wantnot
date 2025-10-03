import { eq } from 'drizzle-orm';
import { type User } from 'firebase/auth';
import { db, users } from '~/db';

export interface DatabaseUser {
  id: string;
  firebaseUid: string;
  email: string;
  displayName: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export class UserService {
  // Get or create user in database from Firebase user
  static async getOrCreateUser(firebaseUser: User): Promise<DatabaseUser> {
    try {
      // First, try to find existing user
      const existingUser = await db
        .select()
        .from(users)
        .where(eq(users.firebaseUid, firebaseUser.uid))
        .limit(1);

      if (existingUser.length > 0) {
        return existingUser[0];
      }

      // Create new user if doesn't exist
      const newUser = await db
        .insert(users)
        .values({
          firebaseUid: firebaseUser.uid,
          email: firebaseUser.email!,
          displayName: firebaseUser.displayName,
        })
        .returning();

      return newUser[0];
    } catch (error) {
      console.error('Error in getOrCreateUser:', error);
      throw new Error('Failed to get or create user');
    }
  }

  // Update user information
  static async updateUser(firebaseUid: string, updates: Partial<DatabaseUser>) {
    try {
      const updatedUser = await db
        .update(users)
        .set({
          ...updates,
          updatedAt: new Date(),
        })
        .where(eq(users.firebaseUid, firebaseUid))
        .returning();

      return updatedUser[0];
    } catch (error) {
      console.error('Error updating user:', error);
      throw new Error('Failed to update user');
    }
  }

  // Get user by Firebase UID
  static async getUserByFirebaseUid(firebaseUid: string): Promise<DatabaseUser | null> {
    try {
      const user = await db
        .select()
        .from(users)
        .where(eq(users.firebaseUid, firebaseUid))
        .limit(1);

      return user.length > 0 ? user[0] : null;
    } catch (error) {
      console.error('Error getting user by Firebase UID:', error);
      throw new Error('Failed to get user');
    }
  }
}