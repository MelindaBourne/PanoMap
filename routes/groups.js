const express = require('express');
const router = express.Router();
const { getDb } = require('../database');
const { authenticate } = require('../middleware/auth');
const { generalLimiter } = require('../middleware/rateLimiter');

// Get all groups (public)
router.get('/', generalLimiter, async (req, res) => {
  try {
    const db = await getDb();
    const groups = await db.all(`
      SELECT g.*, u.username,
        COUNT(p.id) as photo_count
      FROM groups_table g
      JOIN users u ON g.user_id = u.id
      LEFT JOIN photos p ON p.group_id = g.id
      GROUP BY g.id
      ORDER BY g.name ASC
    `);
    res.json({ groups });
  } catch (err) {
    console.error('Get groups error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Create group (requires auth)
router.post('/', generalLimiter, authenticate, async (req, res) => {
  const { name, description, color } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Group name is required' });
  }

  try {
    const db = await getDb();
    const result = await db.run(
      'INSERT INTO groups_table (name, description, color, user_id) VALUES (?, ?, ?, ?)',
      name.trim(), description || null, color || '#3B82F6', req.user.id
    );

    const group = await db.get('SELECT * FROM groups_table WHERE id = ?', result.lastID);
    res.status(201).json({ group });
  } catch (err) {
    console.error('Create group error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update group (requires auth, owner only)
router.put('/:id', generalLimiter, authenticate, async (req, res) => {
  const { name, description, color } = req.body;
  const groupId = parseInt(req.params.id);

  try {
    const db = await getDb();
    const group = await db.get('SELECT * FROM groups_table WHERE id = ?', groupId);
    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }
    if (group.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Permission denied' });
    }

    await db.run(
      'UPDATE groups_table SET name = ?, description = ?, color = ? WHERE id = ?',
      name || group.name,
      description !== undefined ? description : group.description,
      color || group.color,
      groupId
    );

    const updated = await db.get('SELECT * FROM groups_table WHERE id = ?', groupId);
    res.json({ group: updated });
  } catch (err) {
    console.error('Update group error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete group (requires auth, owner only)
router.delete('/:id', generalLimiter, authenticate, async (req, res) => {
  const groupId = parseInt(req.params.id);

  try {
    const db = await getDb();
    const group = await db.get('SELECT * FROM groups_table WHERE id = ?', groupId);
    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }
    if (group.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Permission denied' });
    }

    await db.run('DELETE FROM groups_table WHERE id = ?', groupId);
    res.json({ message: 'Group deleted successfully' });
  } catch (err) {
    console.error('Delete group error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
