require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');

const app = express();

// 中间件
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// 连接MongoDB
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('MongoDB连接成功'))
  .catch(err => console.error('MongoDB连接失败：', err));

// 定义用户模型
const UserSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  avatar: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now }
});

// 定义帖子模型
const PostSchema = new mongoose.Schema({
  title: { type: String, required: true },
  content: { type: String, required: true },
  type: { type: String, required: true }, // 项目招募/活动/拼车等
  images: { type: Array, default: [] },
  author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  views: { type: Number, default: 0 },
  likes: { type: Number, default: 0 },
  comments: [{
    content: String,
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    createdAt: { type: Date, default: Date.now }
  }],
  createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', UserSchema);
const Post = mongoose.model('Post', PostSchema);

// 图片上传配置
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});
const upload = multer({ storage });

// 用户注册接口
app.post('/api/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    const existingUser = await User.findOne({ username });
    if (existingUser) return res.status(400).json({ message: '用户名已存在' });
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    const user = new User({ username, password: hashedPassword });
    await user.save();
    res.status(201).json({ message: '注册成功' });
  } catch (err) {
    res.status(500).json({ message: '服务器错误', err: err.message });
  }
});

// 用户登录接口
app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ username });
    if (!user) return res.status(400).json({ message: '用户名或密码错误' });
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ message: '用户名或密码错误' });
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: user._id, username: user.username, avatar: user.avatar } });
  } catch (err) {
    res.status(500).json({ message: '服务器错误', err: err.message });
  }
});

// 发布帖子接口
app.post('/api/posts', upload.array('images', 3), async (req, res) => {
  try {
    const { title, content, type } = req.body;
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: '请先登录' });
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const images = req.files?.map(file => `http://localhost:3000/uploads/${file.filename}`) || [];
    const post = new Post({
      title,
      content,
      type,
      images,
      author: decoded.id
    });
    await post.save();
    res.status(201).json({ message: '帖子发布成功', post });
  } catch (err) {
    res.status(500).json({ message: '服务器错误', err: err.message });
  }
});

// 获取帖子列表接口
app.get('/api/posts', async (req, res) => {
  try {
    const { page = 1, limit = 10, type = '' } = req.query;
    const query = type ? { type } : {};
    const posts = await Post.find(query)
      .populate('author', 'username avatar')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);
    const total = await Post.countDocuments(query);
    res.json({
      posts,
      totalPages: Math.ceil(total / limit),
      currentPage: page
    });
  } catch (err) {
    res.status(500).json({ message: '服务器错误', err: err.message });
  }
});

// 启动服务
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`后端服务运行在 http://localhost:${PORT}`));