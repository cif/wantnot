import { authenticateRequest } from '~/lib/firebase-admin';
import { UserService } from '~/lib/user-service';
import { db, categories } from '~/db';
import { eq, and } from 'drizzle-orm';

// PUT - Update category
export async function action({ request, params }: { request: Request; params: { id: string } }) {
  const method = request.method;

  try {
    const firebaseUser = await authenticateRequest(request);
    const user = await UserService.getUserByFirebaseUid(firebaseUser.uid);

    if (!user) {
      return Response.json({ error: 'User not found' }, { status: 404 });
    }

    const categoryId = params.id;

    // Verify category belongs to user
    const category = await db
      .select()
      .from(categories)
      .where(and(eq(categories.id, categoryId), eq(categories.userId, user.id)))
      .limit(1);

    if (category.length === 0) {
      return Response.json({ error: 'Category not found' }, { status: 404 });
    }

    if (method === 'PUT') {
      const body = await request.json();
      const { name, budgetLimit, color } = body;

      const updated = await db
        .update(categories)
        .set({
          name: name || category[0].name,
          budgetLimit: budgetLimit !== undefined ? budgetLimit?.toString() : category[0].budgetLimit,
          color: color || category[0].color,
          updatedAt: new Date(),
        })
        .where(eq(categories.id, categoryId))
        .returning();

      return Response.json({ category: updated[0] });
    }

    if (method === 'DELETE') {
      await db
        .delete(categories)
        .where(eq(categories.id, categoryId));

      return Response.json({ success: true });
    }

    return Response.json({ error: 'Method not allowed' }, { status: 405 });
  } catch (error) {
    console.error('Error updating/deleting category:', error);
    return Response.json({ error: 'Failed to update category' }, { status: 500 });
  }
}
