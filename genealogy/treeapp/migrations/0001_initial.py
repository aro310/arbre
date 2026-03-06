from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    initial = True

    dependencies = []

    operations = [
        migrations.CreateModel(
            name='Person',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('first_name', models.CharField(max_length=100, verbose_name='Prénom')),
                ('birth_date', models.DateField(verbose_name='Date de naissance')),
                ('death_date', models.DateField(blank=True, null=True, verbose_name='Date de décès')),
                ('status', models.CharField(choices=[('alive', 'Vivant'), ('deceased', 'Décédé')], default='alive', max_length=10, verbose_name='Statut')),
                ('photo', models.ImageField(blank=True, null=True, upload_to='photos/', verbose_name='Photo')),
                ('father', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='father_children', to='treeapp.person', verbose_name='Père')),
                ('mother', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='mother_children', to='treeapp.person', verbose_name='Mère')),
            ],
            options={'ordering': ['first_name', 'birth_date']},
        ),
    ]
