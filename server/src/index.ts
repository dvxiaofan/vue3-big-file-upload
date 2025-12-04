import Koa from 'koa';
import Router from '@koa/router';
import { koaBody } from 'koa-body';
import cors from '@koa/cors';

const app = new Koa();
const router = new Router();

// Middleware
app.use(cors());
app.use(koaBody({
    multipart: true,
    formidable: {
        maxFileSize: 2000 * 1024 * 1024, // 2GB
        keepExtensions: true,
    }
}));

// Routes
router.get('/', (ctx) => {
    ctx.body = {
        message: 'Hello from Big File Upload Server!',
        status: 'ok'
    };
});

router.post('/upload', (ctx) => {
    // Placeholder for upload logic
    ctx.body = {
        message: 'Upload endpoint ready',
        files: ctx.request.files
    };
});

// Register routes
app.use(router.routes()).use(router.allowedMethods());

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
