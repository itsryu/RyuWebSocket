import { APIEmbed, APIEmbedAuthor, APIEmbedField, APIEmbedFooter, APIEmbedImage, APIEmbedProvider, APIEmbedThumbnail, APIEmbedVideo } from 'discord-api-types/v10';

class EmbedBuilder {
    title?: string;
    description?: string;
    url?: string;
    timestamp?: string;
    color?: number;
    footer?: APIEmbedFooter;
    image?: APIEmbedImage;
    thumbnail?: APIEmbedThumbnail;
    video?: APIEmbedVideo;
    provider?: APIEmbedProvider;
    author?: APIEmbedAuthor;
    fields?: APIEmbedField[];

    constructor(data?: APIEmbed) {
        if (data) {
            EmbedBuilder.validateEmbed(data);

            this.title = data.title;
            this.description = data.description;
            this.url = data.url;
            this.timestamp = data.timestamp;
            this.color = data.color;
            this.footer = data.footer;
            this.image = data.image;
            this.thumbnail = data.thumbnail;
            this.video = data.video;
            this.provider = data.provider;
            this.author = data.author;
            this.fields = data.fields;
        }
    }

    public setTitle(title: string) {
        this.title = title;
        return this;
    }

    public setDescription(description: string) {
        this.description = description;
        return this;
    }

    public setURL(url: string) {
        this.url = url;
        return this;
    }

    public setTimestamp(timestamp: string) {
        this.timestamp = timestamp;
        return this;
    }

    public setColor(color: number) {
        this.color = color;
        return this;
    }

    public setFooter(options: { text: string, icon_url?: string }) {
        this.footer = {
            text: options.text,
            icon_url: options.icon_url
        };
        return this;
    }

    public setImage(url: string) {
        this.image = {
            url
        };
        return this;
    }

    public setThumbnail(url: string) {
        this.thumbnail = {
            url
        };
        return this;
    }

    public setVideo(url: string) {
        this.video = {
            url
        };
        return this;
    }

    public setProvider(options: { name: string, url?: string }) {
        this.provider = {
            name: options.name,
            url: options.url
        };
        return this;
    }

    public setAuthor(options: { name: string, url?: string, icon_url?: string }) {
        this.author = {
            name: options.name,
            url: options.url,
            icon_url: options.icon_url,
            proxy_icon_url: options.icon_url
        };

        return this;
    }

    public addField(options: { name: string, value: string, inline?: boolean }) {
        if (!this.fields) this.fields = [];

        this.fields.push({
            name: options.name,
            value: options.value,
            inline: options.inline
        });

        return this;
    }

    public spliceField(options: { index: number, deleteCount: number, name: string, value: string, inline?: boolean }) {
        if (!this.fields) this.fields = [];
        this.fields.splice(options.index, options.deleteCount, {
            name: options.name,
            value: options.value,
            inline: options.inline
        });
        return this;
    }

    public removeField(index: number) {
        if (!this.fields) this.fields = [];
        this.fields.splice(index, 1);
        return this;
    }

    public clearFields() {
        this.fields = [];
        return this;
    }

    public toJSON() {
        return {
            title: this.title,
            description: this.description,
            url: this.url,
            timestamp: this.timestamp,
            color: this.color,
            footer: this.footer,
            image: this.image,
            thumbnail: this.thumbnail,
            video: this.video,
            provider: this.provider
        };
    }

    private static validateEmbed(embed: APIEmbed) {
        if (!embed.title && !embed.description && !embed.url && !embed.timestamp && !embed.color && !embed.footer && !embed.image && !embed.thumbnail && !embed.video && !embed.provider && !embed.author && !embed.fields) {
            throw new Error('Embed must have at least one property');
        }
        if (embed.fields) embed.fields.forEach(field => { EmbedBuilder.validateField(field); });
        if (embed.footer) EmbedBuilder.validateFooter(embed.footer);
        if (embed.image) EmbedBuilder.validateImage(embed.image);
        if (embed.thumbnail) EmbedBuilder.validateThumbnail(embed.thumbnail);
        if (embed.video) EmbedBuilder.validateVideo(embed.video);
        if (embed.provider) EmbedBuilder.validateProvider(embed.provider);
        if (embed.author) EmbedBuilder.validateAuthor(embed.author);
        if (embed.color) EmbedBuilder.validateColor(embed.color);
    }

    private static validateField(field: APIEmbedField) {
        if (!field.name || !field.value) {
            throw new Error('Embed field must have a name and value');
        }
    }

    private static validateFooter(footer: APIEmbedFooter) {
        if (!footer.text) {
            throw new Error('Embed footer must have text');
        }
    }

    private static validateImage(image: APIEmbedImage) {
        if (!image.url) {
            throw new Error('Embed image must have a url');
        }
    }

    private static validateThumbnail(thumbnail: APIEmbedThumbnail) {
        if (!thumbnail.url) {
            throw new Error('Embed thumbnail must have a url');
        }
    }

    private static validateVideo(video: APIEmbedVideo) {
        if (!video.url) {
            throw new Error('Embed video must have a url');
        }
    }

    private static validateProvider(provider: APIEmbedProvider) {
        if (!provider.name) {
            throw new Error('Embed provider must have a name');
        }
    }

    private static validateAuthor(author: APIEmbedAuthor) {
        if (!author.name) {
            throw new Error('Embed author must have a name');
        }
    }

    private static validateColor(color: number) {
        if (color < 0 || color > 16777215) {
            throw new Error('Embed color must be within the range 0-16777215');
        }
    }

}

export { EmbedBuilder };