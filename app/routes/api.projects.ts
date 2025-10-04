import { authenticateRequest } from '~/lib/firebase-admin';
import { UserService } from '~/lib/user-service';
import { db, projects } from '~/db';
import { eq } from 'drizzle-orm';

// GET - List all projects for user
export async function loader({ request }: { request: Request }) {
  try {
    const firebaseUser = await authenticateRequest(request);
    const user = await UserService.getUserByFirebaseUid(firebaseUser.uid);

    if (!user) {
      return Response.json({ error: 'User not found' }, { status: 404 });
    }

    const userProjects = await db
      .select()
      .from(projects)
      .where(eq(projects.userId, user.id));

    return Response.json({ projects: userProjects });
  } catch (error) {
    console.error('Error fetching projects:', error);
    return Response.json({ error: 'Failed to fetch projects' }, { status: 500 });
  }
}

// POST - Create new project
export async function action({ request }: { request: Request }) {
  try {
    const firebaseUser = await authenticateRequest(request);
    const user = await UserService.getUserByFirebaseUid(firebaseUser.uid);

    if (!user) {
      return Response.json({ error: 'User not found' }, { status: 404 });
    }

    const body = await request.json();
    const { name, description, color, isActive } = body;

    if (!name) {
      return Response.json({ error: 'Project name is required' }, { status: 400 });
    }

    const newProject = await db
      .insert(projects)
      .values({
        userId: user.id,
        name,
        description: description || null,
        color: color || '#8B5CF6',
        isActive: isActive !== undefined ? isActive : true,
      })
      .returning();

    return Response.json({ project: newProject[0] });
  } catch (error) {
    console.error('Error creating project:', error);
    return Response.json({ error: 'Failed to create project' }, { status: 500 });
  }
}
