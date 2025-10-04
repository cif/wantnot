import { authenticateRequest } from '~/lib/firebase-admin';
import { UserService } from '~/lib/user-service';
import { db, projects } from '~/db';
import { eq, and } from 'drizzle-orm';

// PUT - Update project / DELETE - Delete project
export async function action({ request, params }: { request: Request; params: { id: string } }) {
  const method = request.method;

  try {
    const firebaseUser = await authenticateRequest(request);
    const user = await UserService.getUserByFirebaseUid(firebaseUser.uid);

    if (!user) {
      return Response.json({ error: 'User not found' }, { status: 404 });
    }

    const projectId = params.id;

    // Verify project belongs to user
    const project = await db
      .select()
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.userId, user.id)))
      .limit(1);

    if (project.length === 0) {
      return Response.json({ error: 'Project not found' }, { status: 404 });
    }

    if (method === 'PUT') {
      const body = await request.json();
      const { name, description, color, isActive } = body;

      const updated = await db
        .update(projects)
        .set({
          name: name || project[0].name,
          description: description !== undefined ? description : project[0].description,
          color: color || project[0].color,
          isActive: isActive !== undefined ? isActive : project[0].isActive,
          updatedAt: new Date(),
        })
        .where(eq(projects.id, projectId))
        .returning();

      return Response.json({ project: updated[0] });
    }

    if (method === 'DELETE') {
      await db
        .delete(projects)
        .where(eq(projects.id, projectId));

      return Response.json({ success: true });
    }

    return Response.json({ error: 'Method not allowed' }, { status: 405 });
  } catch (error) {
    console.error('Error updating/deleting project:', error);
    return Response.json({ error: 'Failed to update project' }, { status: 500 });
  }
}
