IMAGE := iwangle/gobang
TAG := latest

.PHONY: build push dev clean

# 构建并推送多架构镜像
build:
	docker buildx build --platform linux/amd64,linux/arm64 -t $(IMAGE):$(TAG) --push .

# 本地开发
dev:
	npm run dev

# 本地构建测试
build-local:
	docker build -t $(IMAGE):$(TAG) .

# 运行本地镜像
run:
	docker run -d -p 8080:80 --name gobang $(IMAGE):$(TAG)

# 停止并删除容器
stop:
	docker stop gobang && docker rm gobang

# 清理
clean:
	rm -rf dist node_modules
