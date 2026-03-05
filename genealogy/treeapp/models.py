from django.db import models


class Person(models.Model):
    class Status(models.TextChoices):
        ALIVE = 'alive', 'Vivant'
        DECEASED = 'deceased', 'Décédé'

    first_name = models.CharField('Prénom', max_length=100)
    birth_date = models.DateField('Date de naissance')
    death_date = models.DateField('Date de décès', null=True, blank=True)
    status = models.CharField('Statut', max_length=10, choices=Status.choices, default=Status.ALIVE)
    photo = models.ImageField('Photo', upload_to='photos/', null=True, blank=True)
    father = models.ForeignKey(
        'self', related_name='father_children', null=True, blank=True, on_delete=models.SET_NULL, verbose_name='Père'
    )
    mother = models.ForeignKey(
        'self', related_name='mother_children', null=True, blank=True, on_delete=models.SET_NULL, verbose_name='Mère'
    )
    spouse = models.ForeignKey(
        'self', related_name='spouse_of', null=True, blank=True, on_delete=models.SET_NULL, verbose_name='Conjoint(e)'
    )

    class Meta:
        ordering = ['first_name', 'birth_date']

    def __str__(self):
        return self.first_name

    @property
    def children(self):
        return Person.objects.filter(models.Q(father=self) | models.Q(mother=self)).distinct()
