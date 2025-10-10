import { authenticateRequest } from '~/lib/firebase-admin';
import { UserService } from '~/lib/user-service';
import { db, categories } from '~/db';
import { eq } from 'drizzle-orm';

// POST - Update sort order for multiple categories
export async function action({ request }: { request: Request }) {
  try {
    const firebaseUser = await authenticateRequest(request);
    const user = await UserService.getUserByFirebaseUid(firebaseUser.uid);

    if (!user) {
      return Response.json({ error: 'User not found' }, { status: 404 });
    }

    const body = await request.json();
    const { categoryOrders } = body; // Array of { id: string, sortOrder: number }

    if (!Array.isArray(categoryOrders)) {
      return Response.json({ error: 'categoryOrders must be an array' }, { status: 400 });
    }

    // Update each category's sort order
    await Promise.all(
      categoryOrders.map(({ id, sortOrder }) =>
        db
          .update(categories)
          .set({ sortOrder, updatedAt: new Date() })
          .where(eq(categories.id, id))
      )
    );

    return Response.json({ success: true });
  } catch (error) {
    console.error('Error reordering categories:', error);
    return Response.json({ error: 'Failed to reorder categories' }, { status: 500 });
  }
}
