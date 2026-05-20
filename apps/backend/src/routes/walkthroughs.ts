import { Router } from "express";

import { prisma } from "../lib/prisma.js";
import { authenticate } from "../middleware/auth.js";

const router = Router();

router.use(authenticate);

function matchesPathPattern(pathPattern: string, path: string) {
  if (pathPattern === path || pathPattern === "*") {
    return true;
  }

  if (pathPattern.includes("*")) {
    const regexString = pathPattern
      .split("*")
      .map((part) => part.replace(/[-/\\^$+?.()|[\]{}]/g, "\\$&"))
      .join(".*");
    const regex = new RegExp(`^${regexString}$`);
    return regex.test(path);
  }

  return false;
}

router.post("/", async (req, res) => {
  try {
    const { title, origin, pathPattern, steps } = req.body;

    if (!title || !origin || !pathPattern || !steps) {
      return res.status(400).json({
        error: "Missing required walkthrough fields"
      });
    }

    const walkthrough = await prisma.walkthrough.create({
      data: {
        title,
        origin,
        pathPattern,
        steps,
        userId: req.userId!
      }
    });

    res.json(walkthrough);
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: "Internal server error"
    });
  }
});

router.get("/", async (req, res) => {
  try {
    const origin = Array.isArray(req.query.origin)
      ? String(req.query.origin[0])
      : req.query.origin !== undefined
      ? String(req.query.origin)
      : undefined;
    const path = Array.isArray(req.query.path)
      ? String(req.query.path[0])
      : req.query.path !== undefined
      ? String(req.query.path)
      : undefined;

    const where: Record<string, unknown> = {
      userId: req.userId!
    };

    if (origin) {
      where.origin = origin;
    }

    const walkthroughs = await prisma.walkthrough.findMany({
      where,
      orderBy: {
        id: "asc"
      }
    });

    const filtered = path
      ? walkthroughs.filter((walkthrough) =>
          matchesPathPattern(walkthrough.pathPattern, path)
        )
      : walkthroughs;

    res.json(filtered);
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: "Internal server error"
    });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const walkthrough = await prisma.walkthrough.findUnique({
      where: { id: req.params.id }
    });

    if (!walkthrough) {
      return res.status(404).json({
        error: "Walkthrough not found"
      });
    }

    if (walkthrough.userId !== req.userId) {
      return res.status(403).json({
        error: "Forbidden"
      });
    }

    res.json(walkthrough);
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: "Internal server error"
    });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const walkthrough = await prisma.walkthrough.findUnique({
      where: { id: req.params.id }
    });

    if (!walkthrough) {
      return res.status(404).json({
        error: "Walkthrough not found"
      });
    }

    if (walkthrough.userId !== req.userId) {
      return res.status(403).json({
        error: "Forbidden"
      });
    }

    const { title, origin, pathPattern, steps } = req.body;

    const updated = await prisma.walkthrough.update({
      where: { id: req.params.id },
      data: {
        title: title ?? walkthrough.title,
        origin: origin ?? walkthrough.origin,
        pathPattern: pathPattern ?? walkthrough.pathPattern,
        steps: steps ?? walkthrough.steps
      }
    });

    res.json(updated);
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: "Internal server error"
    });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const walkthrough = await prisma.walkthrough.findUnique({
      where: { id: req.params.id }
    });

    if (!walkthrough) {
      return res.status(404).json({
        error: "Walkthrough not found"
      });
    }

    if (walkthrough.userId !== req.userId) {
      return res.status(403).json({
        error: "Forbidden"
      });
    }

    await prisma.walkthrough.delete({
      where: { id: req.params.id }
    });

    res.json({
      success: true
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: "Internal server error"
    });
  }
});

export default router;
