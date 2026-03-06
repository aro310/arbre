from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('treeapp', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='person',
            name='spouse',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='spouse_of',
                to='treeapp.person',
                verbose_name='Conjoint(e)',
            ),
        ),
    ]
