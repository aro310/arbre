from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('treeapp', '0002_person_spouse'),
    ]

    operations = [
        migrations.AddField(
            model_name='person',
            name='image_url',
            field=models.URLField(blank=True, null=True, verbose_name='Lien image'),
        ),
    ]
