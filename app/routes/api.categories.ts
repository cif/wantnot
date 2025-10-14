import { authenticateRequest } from "~/lib/firebase-admin";
import { UserService } from "~/lib/user-service";
import { db, categories } from "~/db";
import { eq, asc, desc } from "drizzle-orm";

// GET - List all categories for user
export async function loader({ request }: { request: Request }) {
  try {
    const firebaseUser = await authenticateRequest(request);
    const user = await UserService.getUserByFirebaseUid(firebaseUser.uid);

    if (!user) {
      return Response.json({ error: "User not found" }, { status: 404 });
    }

    const userCategories = await db
      .select()
      .from(categories)
      .where(eq(categories.userId, user.id))
      .orderBy(asc(categories.name));

    return Response.json({ categories: userCategories });
  } catch (error) {
    console.error("Error fetching categories:", error);
    return Response.json(
      { error: "Failed to fetch categories" },
      { status: 500 },
    );
  }
}

// POST - Create new category
export async function action({ request }: { request: Request }) {
  try {
    const firebaseUser = await authenticateRequest(request);
    const user = await UserService.getUserByFirebaseUid(firebaseUser.uid);

    if (!user) {
      return Response.json({ error: "User not found" }, { status: 404 });
    }

    const body = await request.json();
    const { name, budgetLimit, color, isIncome } = body;

    if (!name) {
      return Response.json(
        { error: "Category name is required" },
        { status: 400 },
      );
    }

    // Get the max sort order for the user to place new category at the end
    const maxSortOrderResult = await db
      .select()
      .from(categories)
      .where(eq(categories.userId, user.id))
      .orderBy(desc(categories.sortOrder))
      .limit(1);

    const maxSortOrder = maxSortOrderResult[0]?.sortOrder ?? -1;

    const newCategory = await db
      .insert(categories)
      .values({
        userId: user.id,
        name,
        budgetLimit: budgetLimit ? budgetLimit.toString() : null,
        color: color || "#41A6AC",
        isIncome: isIncome || false,
        sortOrder: maxSortOrder + 1,
      })
      .returning();

    return Response.json({ category: newCategory[0] });
  } catch (error) {
    console.error("Error creating category:", error);
    return Response.json(
      { error: "Failed to create category" },
      { status: 500 },
    );
  }
}
